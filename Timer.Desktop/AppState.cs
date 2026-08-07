namespace TimerDesktop;

internal sealed class AppState
{
    public int SchemaVersion { get; set; } = 1;
    public TimerState Timer { get; set; } = new();
    public DraftState Draft { get; set; } = new();
    public SettingsState Settings { get; set; } = new();
    public Guid? ActiveHistoryId { get; set; }
    public List<HistoryEntry> History { get; set; } = [];

    public AppState Clone() => new()
    {
        SchemaVersion = SchemaVersion,
        Timer = Timer.Clone(),
        Draft = Draft.Clone(),
        Settings = Settings.Clone(),
        ActiveHistoryId = ActiveHistoryId,
        History = History.Select(x => x.Clone()).ToList()
    };

    public static AppState CreateDefault() => new();
}

internal sealed class TimerState
{
    public bool IsRunning { get; set; }
    public DateTimeOffset? StartedAtUtc { get; set; }
    public long ElapsedMilliseconds { get; set; }

    public TimerState Clone() => new()
    {
        IsRunning = IsRunning,
        StartedAtUtc = StartedAtUtc,
        ElapsedMilliseconds = ElapsedMilliseconds
    };
}

internal sealed class DraftState
{
    public string TaskNumber { get; set; } = "6467";
    public string DevNumber { get; set; } = "";
    public string JobName { get; set; } = "기타업무";
    public string Memo { get; set; } = "";

    public DraftState Clone() => new()
    {
        TaskNumber = TaskNumber,
        DevNumber = DevNumber,
        JobName = JobName,
        Memo = Memo
    };

    public void Normalize()
    {
        TaskNumber = string.IsNullOrWhiteSpace(TaskNumber) ? "6467" : TaskNumber.Trim();
        DevNumber = DevNumber?.Trim() ?? "";
        JobName = string.IsNullOrWhiteSpace(JobName) ? "기타업무" : JobName.Trim();
        Memo ??= "";
    }
}

internal sealed class SettingsState
{
    public bool AutoStart { get; set; }
    public bool MinuteDisplay { get; set; }
    public bool TopMost { get; set; }

    public SettingsState Clone() => new()
    {
        AutoStart = AutoStart,
        MinuteDisplay = MinuteDisplay,
        TopMost = TopMost
    };
}

internal sealed class HistoryEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string TaskNumber { get; set; } = "6467";
    public string DevNumber { get; set; } = "";
    public string JobName { get; set; } = "기타업무";
    public string Memo { get; set; } = "";
    public long ElapsedMilliseconds { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; }
    public DateTimeOffset LastModifiedUtc { get; set; }
    public bool Completed { get; set; }

    public HistoryEntry Clone() => new()
    {
        Id = Id,
        TaskNumber = TaskNumber,
        DevNumber = DevNumber,
        JobName = JobName,
        Memo = Memo,
        ElapsedMilliseconds = ElapsedMilliseconds,
        CreatedAtUtc = CreatedAtUtc,
        LastModifiedUtc = LastModifiedUtc,
        Completed = Completed
    };
}
