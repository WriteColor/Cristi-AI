using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace CristiInput
{
    class Program
    {
        [DllImport("user32.dll", SetLastError = true)]
        private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
        private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern int GetWindowTextLength(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool IsIconic(IntPtr hWnd);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool IsZoomed(IntPtr hWnd);

        private const int SW_SHOWNORMAL = 1;
        private const int SW_SHOWMINIMIZED = 2;
        private const int SW_MAXIMIZE = 3;
        private const int SW_MINIMIZE = 6;
        private const int SW_RESTORE = 9;
        private const uint WM_CLOSE = 0x0010;

        private const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
        private const uint KEYEVENTF_KEYUP = 0x0002;
        private const uint KEYEVENTF_UNICODE = 0x0004;

        private const int INPUT_KEYBOARD = 1;

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
                Console.WriteLine("CristiInput - Native Windows Automation");
                Console.WriteLine("Usage: CristiInput.exe key <combo> | text <string> | desktop | windows | focus <query> | window <action> <query>");
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

            if (command == "windows")
            {
                ListWindows();
                return 0;
            }

            if (command == "focus" && args.Length > 1)
            {
                string query = string.Join(" ", args, 1, args.Length - 1);
                return FocusWindow(query);
            }

            if (command == "window" && args.Length > 2)
            {
                string action = args[1];
                string query = string.Join(" ", args, 2, args.Length - 2);
                return ManageWindow(action, query);
            }

            return 1;
        }

        private static string EscapeJson(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            StringBuilder sb = new StringBuilder();
            foreach (char c in s)
            {
                switch (c)
                {
                    case '\\': sb.Append("\\\\"); break;
                    case '"': sb.Append("\\\""); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    default:
                        if (c < 32) sb.AppendFormat("\\u{0:x4}", (int)c);
                        else sb.Append(c);
                        break;
                }
            }
            return sb.ToString();
        }

        private static void ListWindows()
        {
            List<string> jsonItems = new List<string>();
            EnumWindows((hWnd, lParam) =>
            {
                if (!IsWindowVisible(hWnd)) return true;
                int length = GetWindowTextLength(hWnd);
                if (length == 0) return true;

                StringBuilder sb = new StringBuilder(length + 1);
                GetWindowText(hWnd, sb, sb.Capacity);
                string title = sb.ToString().Trim();
                if (string.IsNullOrEmpty(title)) return true;

                uint pid = 0;
                GetWindowThreadProcessId(hWnd, out pid);
                string processName = "";
                try
                {
                    if (pid != 0)
                    {
                        using (Process proc = Process.GetProcessById((int)pid))
                        {
                            processName = proc.ProcessName;
                        }
                    }
                }
                catch { }

                bool minimized = IsIconic(hWnd);
                bool maximized = IsZoomed(hWnd);

                jsonItems.Add(string.Format("{{\"hwnd\":{0},\"pid\":{1},\"title\":\"{2}\",\"process\":\"{3}\",\"isMinimized\":{4},\"isMaximized\":{5}}}",
                    hWnd.ToInt64(), pid, EscapeJson(title), EscapeJson(processName),
                    minimized ? "true" : "false", maximized ? "true" : "false"));

                return true;
            }, IntPtr.Zero);

            Console.WriteLine("[" + string.Join(",", jsonItems.ToArray()) + "]");
        }

        private static IntPtr FindWindowByQuery(string query)
        {
            if (string.IsNullOrEmpty(query)) return IntPtr.Zero;
            string clean = query.Trim();

            long parsedHwnd;
            if (long.TryParse(clean, out parsedHwnd))
            {
                IntPtr ptr = new IntPtr(parsedHwnd);
                if (IsWindowVisible(ptr)) return ptr;
            }

            IntPtr exactMatch = IntPtr.Zero;
            IntPtr startsMatch = IntPtr.Zero;
            IntPtr containsMatch = IntPtr.Zero;
            IntPtr procMatch = IntPtr.Zero;

            EnumWindows((hWnd, lParam) =>
            {
                if (!IsWindowVisible(hWnd)) return true;
                int length = GetWindowTextLength(hWnd);
                if (length == 0) return true;

                StringBuilder sb = new StringBuilder(length + 1);
                GetWindowText(hWnd, sb, sb.Capacity);
                string title = sb.ToString().Trim();
                if (string.IsNullOrEmpty(title)) return true;

                uint pid = 0;
                GetWindowThreadProcessId(hWnd, out pid);
                string processName = "";
                try
                {
                    if (pid != 0)
                    {
                        using (Process proc = Process.GetProcessById((int)pid))
                        {
                            processName = proc.ProcessName;
                        }
                    }
                }
                catch { }

                if (string.Equals(title, clean, StringComparison.OrdinalIgnoreCase))
                {
                    exactMatch = hWnd;
                    return false; // Stop search
                }

                if (startsMatch == IntPtr.Zero && title.StartsWith(clean, StringComparison.OrdinalIgnoreCase))
                {
                    startsMatch = hWnd;
                }

                if (containsMatch == IntPtr.Zero && title.IndexOf(clean, StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    containsMatch = hWnd;
                }

                if (procMatch == IntPtr.Zero && !string.IsNullOrEmpty(processName) &&
                    (processName.IndexOf(clean, StringComparison.OrdinalIgnoreCase) >= 0 ||
                     clean.IndexOf(processName, StringComparison.OrdinalIgnoreCase) >= 0))
                {
                    procMatch = hWnd;
                }

                return true;
            }, IntPtr.Zero);

            if (exactMatch != IntPtr.Zero) return exactMatch;
            if (startsMatch != IntPtr.Zero) return startsMatch;
            if (containsMatch != IntPtr.Zero) return containsMatch;
            return procMatch;
        }

        private static int FocusWindow(string query)
        {
            IntPtr targetHwnd = FindWindowByQuery(query);
            if (targetHwnd == IntPtr.Zero)
            {
                Console.WriteLine("{\"success\":false,\"error\":\"No window found matching query\"}");
                return 1;
            }

            if (IsIconic(targetHwnd))
            {
                ShowWindow(targetHwnd, SW_RESTORE);
            }
            else
            {
                ShowWindow(targetHwnd, SW_SHOWNORMAL);
            }

            bool focused = SetForegroundWindow(targetHwnd);
            StringBuilder sb = new StringBuilder(256);
            GetWindowText(targetHwnd, sb, 256);
            string title = sb.ToString();

            Console.WriteLine(string.Format("{{\"success\":{0},\"hwnd\":{1},\"title\":\"{2}\"}}",
                focused ? "true" : "false", targetHwnd.ToInt64(), EscapeJson(title)));
            return focused ? 0 : 1;
        }

        private static int ManageWindow(string action, string query)
        {
            IntPtr targetHwnd = FindWindowByQuery(query);
            if (targetHwnd == IntPtr.Zero)
            {
                Console.WriteLine("{\"success\":false,\"error\":\"No window found matching query\"}");
                return 1;
            }

            string act = action.ToLowerInvariant();
            if (act == "minimize")
            {
                ShowWindow(targetHwnd, SW_MINIMIZE);
            }
            else if (act == "maximize")
            {
                ShowWindow(targetHwnd, SW_MAXIMIZE);
            }
            else if (act == "restore")
            {
                ShowWindow(targetHwnd, SW_RESTORE);
            }
            else if (act == "close")
            {
                PostMessage(targetHwnd, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
            }
            else
            {
                Console.WriteLine(string.Format("{{\"success\":false,\"error\":\"Accion desconocida: {0}\"}}", EscapeJson(act)));
                return 1;
            }

            Console.WriteLine(string.Format("{{\"success\":true,\"action\":\"{0}\",\"hwnd\":{1}}}",
                EscapeJson(act), targetHwnd.ToInt64()));
            return 0;
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
