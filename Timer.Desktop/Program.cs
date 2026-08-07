using System.Runtime.InteropServices;

namespace TimerDesktop;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Contains("--self-test", StringComparer.OrdinalIgnoreCase))
        {
            return SelfTest.Run();
        }

        using var mutex = new Mutex(true, @"Local\TimerDesktop.SingleInstance", out var isFirstInstance);
        if (!isFirstInstance)
        {
            return 0;
        }

        ApplicationConfiguration.Initialize();
        var stateDirectory = Environment.GetEnvironmentVariable("TIMER_STATE_DIR");
        var store = new StateStore(stateDirectory);
        var state = store.Load(out var warning);
        var engine = new TimerEngine(state, store);

        var probeRunning = args.Contains("--probe-running", StringComparer.OrdinalIgnoreCase);
        var probePaused = args.Contains("--probe-paused", StringComparer.OrdinalIgnoreCase);
        if (probeRunning && !engine.Current.Timer.IsRunning)
        {
            engine.Start(DateTimeOffset.UtcNow);
        }
        else if (probePaused && engine.Current.Timer.IsRunning)
        {
            engine.Pause(DateTimeOffset.UtcNow);
        }

        var showOnStart = args.Contains("--show", StringComparer.OrdinalIgnoreCase) ||
                          (!probeRunning && !probePaused);
        using var context = new TrayApplicationContext(
            engine,
            showOnStart,
            warning);
        Application.Run(context);
        return 0;
    }
}

internal sealed class TrayApplicationContext : ApplicationContext
{
    private readonly MainForm _form;
    private readonly NotifyIcon _notifyIcon;
    private readonly Icon _icon;
    private bool _exiting;

    public TrayApplicationContext(TimerEngine engine, bool showOnStart, string? startupWarning)
    {
        _icon = AppIcon.Load();
        _form = new MainForm(engine, _icon);
        MainForm = _form;

        var menu = new ContextMenuStrip();
        menu.Items.Add("열기", null, (_, _) => ShowWindow());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("종료", null, (_, _) => ExitApplication());

        _notifyIcon = new NotifyIcon
        {
            Icon = _icon,
            Text = "Timer",
            ContextMenuStrip = menu,
            Visible = true
        };
        _notifyIcon.DoubleClick += (_, _) => ShowWindow();

        if (showOnStart)
        {
            Application.Idle += ShowInitialWindow;
        }

        if (!string.IsNullOrWhiteSpace(startupWarning))
        {
            _form.BeginInvoke(() =>
                MessageBox.Show(_form, startupWarning, "Timer", MessageBoxButtons.OK, MessageBoxIcon.Warning));
        }
    }

    private void ShowWindow()
    {
        if (!_form.Visible)
        {
            _form.Show();
        }
        if (_form.WindowState == FormWindowState.Minimized)
        {
            _form.WindowState = FormWindowState.Normal;
        }
        _form.BringToFront();
        _form.Activate();
        RestoreWindow(_form.Handle, 9);
        SetForegroundWindow(_form.Handle);
    }

    private void ShowInitialWindow(object? sender, EventArgs e)
    {
        Application.Idle -= ShowInitialWindow;
        ShowWindow();
    }

    private void ExitApplication()
    {
        if (_exiting || !_form.TrySavePending())
        {
            return;
        }

        _exiting = true;
        _notifyIcon.Visible = false;
        _form.AllowExit = true;
        ExitThread();
    }

    protected override void ExitThreadCore()
    {
        _notifyIcon.Dispose();
        _form.Dispose();
        _icon.Dispose();
        base.ExitThreadCore();
    }

    [DllImport("user32.dll", EntryPoint = "ShowWindow")]
    private static extern bool RestoreWindow(IntPtr hWnd, int command);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);
}

internal static class AppIcon
{
    public static Icon Load()
    {
        using var stream = typeof(AppIcon).Assembly.GetManifestResourceStream("TimerDesktop.clock.png");
        if (stream is null)
        {
            return (Icon)SystemIcons.Application.Clone();
        }

        using var bitmap = new Bitmap(stream);
        var handle = bitmap.GetHicon();
        try
        {
            using var source = Icon.FromHandle(handle);
            return (Icon)source.Clone();
        }
        finally
        {
            DestroyIcon(handle);
        }
    }

    [DllImport("user32.dll")]
    private static extern bool DestroyIcon(IntPtr handle);
}
