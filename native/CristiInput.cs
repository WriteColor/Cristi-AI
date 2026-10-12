using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

namespace CristiInput
{
    class Program
    {
        [DllImport("user32.dll", SetLastError = true)]
        private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

        private const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
        private const uint KEYEVENTF_KEYUP = 0x0002;
        private const uint KEYEVENTF_UNICODE = 0x0004;

        private const int INPUT_KEYBOARD = 1;
        private const int INPUT_MOUSE = 0;

        [StructLayout(LayoutKind.Sequential)]
        struct INPUT
        {
            public int type;
            public InputUnion u;
        }

        [StructLayout(LayoutKind.Explicit)]
        struct InputUnion
        {
            [FieldOffset(0)]
            public MOUSEINPUT mi;
            [FieldOffset(0)]
            public KEYBDINPUT ki;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct KEYBDINPUT
        {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public UIntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct MOUSEINPUT
        {
            public int dx;
            public int dy;
            public uint mouseData;
            public uint dwFlags;
            public uint time;
            public UIntPtr dwExtraInfo;
        }

        private static readonly Dictionary<string, byte> KeyMap = new Dictionary<string, byte>(StringComparer.OrdinalIgnoreCase)
        {
            // Modifiers
            { "win", 0x5B },
            { "windows", 0x5B },
            { "lwin", 0x5B },
            { "rwin", 0x5C },
            { "meta", 0x5B },
            { "super", 0x5B },
            { "cmd", 0x5B },
            { "command", 0x5B },
            { "ctrl", 0x11 },
            { "control", 0x11 },
            { "lctrl", 0xA2 },
            { "rctrl", 0xA3 },
            { "alt", 0x12 },
            { "menu", 0x12 },
            { "lalt", 0xA4 },
            { "ralt", 0xA5 },
            { "shift", 0x10 },
            { "lshift", 0xA0 },
            { "rshift", 0xA1 },

            // Special keys
            { "enter", 0x0D },
            { "return", 0x0D },
            { "esc", 0x1B },
            { "escape", 0x1B },
            { "tab", 0x09 },
            { "space", 0x20 },
            { "spacebar", 0x20 },
            { "backspace", 0x08 },
            { "bksp", 0x08 },
            { "delete", 0x2E },
            { "del", 0x2E },
            { "insert", 0x2D },
            { "ins", 0x2D },
            { "home", 0x24 },
            { "end", 0x23 },
            { "pageup", 0x21 },
            { "pgup", 0x21 },
            { "pagedown", 0x22 },
            { "pgdn", 0x22 },
            { "up", 0x26 },
            { "down", 0x28 },
            { "left", 0x25 },
            { "right", 0x27 },
            { "printscreen", 0x2C },
            { "prtsc", 0x2C },
            { "pause", 0x13 },
            { "capslock", 0x14 },
            { "numlock", 0x90 },
            { "scrolllock", 0x91 },

            // Volume & Media
            { "volumemute", 0xAD },
            { "volumedown", 0xAE },
            { "volumeup", 0xAF },
            { "medianext", 0xB0 },
            { "mediaprev", 0xB1 },
            { "mediastop", 0xB2 },
            { "mediaplaypause", 0xB3 },

            // Function keys
            { "f1", 0x70 }, { "f2", 0x71 }, { "f3", 0x72 }, { "f4", 0x73 },
            { "f5", 0x74 }, { "f6", 0x75 }, { "f7", 0x76 }, { "f8", 0x77 },
            { "f9", 0x78 }, { "f10", 0x79 }, { "f11", 0x7A }, { "f12", 0x7B },
            { "f13", 0x7C }, { "f14", 0x7D }, { "f15", 0x7E }, { "f16", 0x7F },
            { "f17", 0x80 }, { "f18", 0x81 }, { "f19", 0x82 }, { "f20", 0x83 },
            { "f21", 0x84 }, { "f22", 0x85 }, { "f23", 0x86 }, { "f24", 0x87 }
        };

        static int Main(string[] args)
        {
            if (args.Length == 0)
            {
                Console.WriteLine("CristiInput - Native Windows Input Automation");
                Console.WriteLine("Usage: CristiInput.exe key <combo> | text <string> | desktop");
                return 1;
            }

            string command = args[0].ToLowerInvariant();

            if (command == "desktop")
            {
                ToggleDesktop();
                return 0;
            }

            if (command == "key" && args.Length > 1)
            {
                string combo = string.Join(" ", args, 1, args.Length - 1);
                return PressKeyCombo(combo) ? 0 : 1;
            }

            if (command == "text" && args.Length > 1)
            {
                string text = string.Join(" ", args, 1, args.Length - 1);
                SendUnicodeText(text);
                return 0;
            }

            return 1;
        }

        private static void ToggleDesktop()
        {
            try
            {
                Type shellType = Type.GetTypeFromProgID("Shell.Application");
                if (shellType != null)
                {
                    object shell = Activator.CreateInstance(shellType);
                    shellType.InvokeMember("ToggleDesktop", System.Reflection.BindingFlags.InvokeMethod, null, shell, null);
                    return;
                }
            }
            catch { }

            // Fallback to Win+D key simulation
            PressKeyCombo("Win+d");
        }

        private static bool PressKeyCombo(string combo)
        {
            string[] rawTokens = combo.Split(new char[] { '+', '-' }, StringSplitOptions.RemoveEmptyEntries);
            if (rawTokens.Length == 0) return false;

            List<byte> modifiers = new List<byte>();
            byte baseKey = 0;

            for (int i = 0; i < rawTokens.Length; i++)
            {
                string token = rawTokens[i].Trim();
                if (string.IsNullOrEmpty(token)) continue;

                byte modVk;
                if (IsModifier(token, out modVk))
                {
                    // If it's the last token and we have no other keys, it's just pressing that modifier (e.g. Win key alone)
                    if (i == rawTokens.Length - 1 && modifiers.Count == 0 && baseKey == 0)
                    {
                        baseKey = modVk;
                    }
                    else
                    {
                        modifiers.Add(modVk);
                    }
                }
                else
                {
                    baseKey = ResolveKey(token);
                }
            }

            if (baseKey == 0 && modifiers.Count > 0)
            {
                baseKey = modifiers[modifiers.Count - 1];
                modifiers.RemoveAt(modifiers.Count - 1);
            }

            if (baseKey == 0) return false;

            // 1. Press modifiers down
            foreach (byte mod in modifiers)
            {
                keybd_event(mod, 0, KEYEVENTF_EXTENDEDKEY, UIntPtr.Zero);
                Thread.Sleep(10);
            }

            // 2. Press base key down & up
            keybd_event(baseKey, 0, KEYEVENTF_EXTENDEDKEY, UIntPtr.Zero);
            Thread.Sleep(30);
            keybd_event(baseKey, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, UIntPtr.Zero);
            Thread.Sleep(10);

            // 3. Release modifiers in reverse order
            for (int i = modifiers.Count - 1; i >= 0; i--)
            {
                keybd_event(modifiers[i], 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, UIntPtr.Zero);
                Thread.Sleep(5);
            }

            return true;
        }

        private static bool IsModifier(string token, out byte vk)
        {
            string t = token.ToLowerInvariant();
            if (t == "ctrl" || t == "control") { vk = 0x11; return true; }
            if (t == "alt" || t == "menu") { vk = 0x12; return true; }
            if (t == "shift") { vk = 0x10; return true; }
            if (t == "win" || t == "windows" || t == "meta" || t == "super" || t == "cmd" || t == "command") { vk = 0x5B; return true; }
            vk = 0;
            return false;
        }

        private static byte ResolveKey(string token)
        {
            byte mapped;
            if (KeyMap.TryGetValue(token, out mapped))
            {
                return mapped;
            }

            if (token.Length == 1)
            {
                char c = token[0];
                if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'))
                {
                    return (byte)char.ToUpperInvariant(c);
                }
                if (c >= '0' && c <= '9')
                {
                    return (byte)c;
                }
            }

            return 0;
        }

        private static void SendUnicodeText(string text)
        {
            if (string.IsNullOrEmpty(text)) return;

            INPUT[] inputs = new INPUT[text.Length * 2];
            int idx = 0;

            for (int i = 0; i < text.Length; i++)
            {
                char c = text[i];

                // Key down
                inputs[idx].type = INPUT_KEYBOARD;
                inputs[idx].u.ki.wVk = 0;
                inputs[idx].u.ki.wScan = (ushort)c;
                inputs[idx].u.ki.dwFlags = KEYEVENTF_UNICODE;
                inputs[idx].u.ki.time = 0;
                inputs[idx].u.ki.dwExtraInfo = UIntPtr.Zero;
                idx++;

                // Key up
                inputs[idx].type = INPUT_KEYBOARD;
                inputs[idx].u.ki.wVk = 0;
                inputs[idx].u.ki.wScan = (ushort)c;
                inputs[idx].u.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
                inputs[idx].u.ki.time = 0;
                inputs[idx].u.ki.dwExtraInfo = UIntPtr.Zero;
                idx++;
            }

            SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
        }
    }
}
