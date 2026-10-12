// Optional Windows Core Audio loopback helper for Cristi AI.
//
// The renderer cannot open arbitrary system/game output devices through the
// browser API.  This small, dependency-free helper uses the built-in WASAPI
// loopback endpoint and writes length-prefixed PCM frames to stdout.  It is
// launched by Electron only when explicitly requested; the existing
// getDisplayMedia path remains available as a portable fallback.

using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

internal static class CristiWasapiLoopback
{
    private const int S_OK = 0;
    private const uint CLSCTX_ALL = 0x17;
    private const long REFERENCE_TIME_BUFFER = 1000000; // 100 ms
    private const uint AUDCLNT_STREAMFLAGS_LOOPBACK = 0x00020000;
    private const uint AUDCLNT_BUFFERFLAGS_SILENT = 0x00000002;
    private const ushort WAVE_FORMAT_PCM = 1;
    private const ushort WAVE_FORMAT_IEEE_FLOAT = 3;
    private const ushort WAVE_FORMAT_EXTENSIBLE = 0xFFFE;

    private static readonly Guid CLSID_MMDeviceEnumerator = new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E");
    private static readonly Guid IID_IAudioClient = new Guid("1CB9AD4C-DBFA-4C32-B178-C2F568A703B2");
    private static readonly Guid IID_IAudioCaptureClient = new Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317");

    private static volatile bool stopping;

    [DllImport("ole32.dll")]
    private static extern int CoInitializeEx(IntPtr reserved, uint coInit);

    [DllImport("ole32.dll")]
    private static extern void CoUninitialize();

    [DllImport("kernel32.dll")]
    private static extern bool SetConsoleCtrlHandler(ConsoleCtrlHandlerRoutine handlerRoutine, bool add);

    private delegate bool ConsoleCtrlHandlerRoutine(uint ctrlType);

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceEnumerator
    {
        [PreserveSig] int EnumAudioEndpoints(int dataFlow, uint stateMask, out IntPtr devices);
        [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
        [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
        [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr callback);
        [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr callback);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDevice
    {
        [PreserveSig] int Activate(ref Guid iid, uint clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object instance);
        [PreserveSig] int OpenPropertyStore(int access, out IntPtr properties);
        [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
        [PreserveSig] int GetState(out uint state);
    }

    [ComImport, Guid("1CB9AD4C-DBFA-4C32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioClient
    {
        [PreserveSig] int Initialize(int shareMode, uint streamFlags, long bufferDuration, long periodicity, IntPtr format, IntPtr sessionGuid);
        [PreserveSig] int GetBufferSize(out uint numBufferFrames);
        [PreserveSig] int GetStreamLatency(out long latency);
        [PreserveSig] int GetCurrentPadding(out uint numFramesPadding);
        [PreserveSig] int IsFormatSupported(int shareMode, IntPtr format, out IntPtr closestMatch);
        [PreserveSig] int GetMixFormat(out IntPtr format);
        [PreserveSig] int GetDevicePeriod(out long defaultPeriod, out long minimumPeriod);
        [PreserveSig] int Start();
        [PreserveSig] int Stop();
        [PreserveSig] int Reset();
        [PreserveSig] int SetEventHandle(IntPtr eventHandle);
        [PreserveSig] int GetService(ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object service);
    }

    [ComImport, Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioCaptureClient
    {
        [PreserveSig] int GetBuffer(out IntPtr data, out uint numFrames, out uint flags, out ulong devicePosition, out ulong qpcPosition);
        [PreserveSig] int ReleaseBuffer(uint numFrames);
        [PreserveSig] int GetNextPacketSize(out uint numFrames);
    }

    [StructLayout(LayoutKind.Sequential, Pack = 2)]
    private struct WaveFormatEx
    {
        public ushort formatTag;
        public ushort channels;
        public uint samplesPerSec;
        public uint avgBytesPerSec;
        public ushort blockAlign;
        public ushort bitsPerSample;
        public ushort extraSize;
    }

    private static void Ensure(int hr, string operation)
    {
        if (hr < S_OK) Marshal.ThrowExceptionForHR(hr, new IntPtr(-1));
    }

    private static float ReadSample(IntPtr source, int offset, ushort bits, bool isFloat)
    {
        if (isFloat) return Marshal.PtrToStructure<float>(IntPtr.Add(source, offset));
        if (bits == 8) return (Marshal.ReadByte(source, offset) - 128) / 128f;
        if (bits == 16) return Marshal.ReadInt16(source, offset) / 32768f;
        if (bits == 24)
        {
            int value = Marshal.ReadByte(source, offset) |
                        (Marshal.ReadByte(source, offset + 1) << 8) |
                        (Marshal.ReadByte(source, offset + 2) << 16);
            if ((value & 0x800000) != 0) value |= unchecked((int)0xFF000000);
            return value / 8388608f;
        }
        if (bits == 32) return Marshal.ReadInt32(source, offset) / 2147483648f;
        return 0f;
    }

    private static byte[] ConvertToPcm16(IntPtr source, uint frames, ushort channels, ushort bits, bool isFloat, ushort blockAlign, bool silent)
    {
        byte[] output = new byte[frames * 2];
        int bytesPerSample = Math.Max(1, bits / 8);
        for (uint frame = 0; frame < frames; frame++)
        {
            float mixed = 0f;
            if (!silent)
            {
                IntPtr framePtr = IntPtr.Add(source, checked((int)(frame * blockAlign)));
                for (ushort channel = 0; channel < channels; channel++)
                {
                    mixed += ReadSample(framePtr, channel * bytesPerSample, bits, isFloat);
                }
                if (channels > 1) mixed /= channels;
            }
            mixed = Math.Max(-1f, Math.Min(1f, mixed));
            short value = (short)(mixed < 0 ? mixed * 32768f : mixed * 32767f);
            output[frame * 2] = (byte)(value & 0xFF);
            output[frame * 2 + 1] = (byte)((value >> 8) & 0xFF);
        }
        return output;
    }

    private static void WriteFrame(Stream output, uint sampleRate, byte[] pcm)
    {
        // Header: magic 'CRIS', sampleRate, payloadBytes, flags. Little-endian.
        byte[] header = new byte[16];
        header[0] = (byte)'C'; header[1] = (byte)'R'; header[2] = (byte)'I'; header[3] = (byte)'S';
        Buffer.BlockCopy(BitConverter.GetBytes(sampleRate), 0, header, 4, 4);
        Buffer.BlockCopy(BitConverter.GetBytes((uint)pcm.Length), 0, header, 8, 4);
        output.Write(header, 0, header.Length);
        output.Write(pcm, 0, pcm.Length);
        output.Flush();
    }

    public static int Main(string[] args)
    {
        ConsoleCtrlHandlerRoutine handler = delegate(uint _) { stopping = true; return true; };
        SetConsoleCtrlHandler(handler, true);
        int coResult = CoInitializeEx(IntPtr.Zero, 0x0 /* COINIT_MULTITHREADED */);
        if (coResult < 0 && coResult != unchecked((int)0x80010106)) return coResult;
        try
        {
            IMMDeviceEnumerator enumerator = (IMMDeviceEnumerator)Activator.CreateInstance(Type.GetTypeFromCLSID(CLSID_MMDeviceEnumerator));
            IMMDevice device;
            Ensure(enumerator.GetDefaultAudioEndpoint(0 /* eRender */, 1 /* eMultimedia */, out device), "GetDefaultAudioEndpoint");
            object clientObject;
            Guid audioClientIid = IID_IAudioClient;
            Ensure(device.Activate(ref audioClientIid, CLSCTX_ALL, IntPtr.Zero, out clientObject), "Activate IAudioClient");
            IAudioClient client = (IAudioClient)clientObject;
            IntPtr formatPtr;
            Ensure(client.GetMixFormat(out formatPtr), "GetMixFormat");
            WaveFormatEx format = Marshal.PtrToStructure<WaveFormatEx>(formatPtr);
            bool isFloat = format.formatTag == WAVE_FORMAT_IEEE_FLOAT;
            if (format.formatTag == WAVE_FORMAT_EXTENSIBLE)
            {
                // WAVEFORMATEXTENSIBLE.SubFormat starts at offset 24. The
                // standard IEEE_FLOAT data1 is 00000003; PCM is 00000001.
                int data1 = Marshal.ReadInt32(formatPtr, 24);
                isFloat = data1 == 3;
            }
            Ensure(client.Initialize(0 /* shared */, AUDCLNT_STREAMFLAGS_LOOPBACK, REFERENCE_TIME_BUFFER, 0, formatPtr, IntPtr.Zero), "Initialize loopback");
            object captureObject;
            Guid captureClientIid = IID_IAudioCaptureClient;
            Ensure(client.GetService(ref captureClientIid, out captureObject), "GetService IAudioCaptureClient");
            IAudioCaptureClient capture = (IAudioCaptureClient)captureObject;
            Ensure(client.Start(), "Start loopback");
            Stream output = Console.OpenStandardOutput();
            try
            {
                while (!stopping)
                {
                    uint packetFrames;
                    Ensure(capture.GetNextPacketSize(out packetFrames), "GetNextPacketSize");
                    if (packetFrames == 0) { Thread.Sleep(4); continue; }
                    while (packetFrames > 0 && !stopping)
                    {
                        IntPtr data;
                        uint frames;
                        uint flags;
                        ulong devicePosition;
                        ulong qpcPosition;
                        Ensure(capture.GetBuffer(out data, out frames, out flags, out devicePosition, out qpcPosition), "GetBuffer");
                        byte[] pcm = ConvertToPcm16(data, frames, format.channels, format.bitsPerSample, isFloat, format.blockAlign, (flags & AUDCLNT_BUFFERFLAGS_SILENT) != 0);
                        WriteFrame(output, format.samplesPerSec, pcm);
                        Ensure(capture.ReleaseBuffer(frames), "ReleaseBuffer");
                        Ensure(capture.GetNextPacketSize(out packetFrames), "GetNextPacketSize");
                    }
                }
            }
            finally
            {
                try { client.Stop(); } catch (Exception) { }
                output.Dispose();
            }
            return 0;
        }
        catch (Exception error)
        {
            try { Console.Error.WriteLine(error.GetType().Name + ": " + error.Message); } catch (Exception) { }
            return 1;
        }
        finally
        {
            if (coResult >= 0) CoUninitialize();
        }
    }
}
