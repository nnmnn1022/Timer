namespace TimerDesktop;

internal static class SelfTest
{
    private static int _assertions;

    public static int Run()
    {
        try
        {
            TimerTransitions();
            HistoryTransitions();
            LoadAndStore();
            TsvGolden();
            Console.WriteLine($"SELF-TEST PASS ({_assertions} assertions)");
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"SELF-TEST FAIL: {ex.Message}");
            return 1;
        }
    }

    private static void TimerTransitions()
    {
        var now = new DateTimeOffset(2026, 7, 31, 0, 0, 0, TimeSpan.Zero);
        var store = new CountingStore();
        var engine = new TimerEngine(AppState.CreateDefault(), store);

        Assert(engine.Start(now), "start succeeds");
        Assert(store.SaveCount == 1, "start saves once");
        Assert(engine.Start(now.AddSeconds(1)), "duplicate start is successful no-op");
        Assert(store.SaveCount == 1, "duplicate start does not save");
        Assert(engine.GetElapsedMilliseconds(now.AddSeconds(3)) == 3000, "elapsed uses UTC");
        var restored = new TimerEngine(engine.Current.Clone(), new CountingStore());
        Assert(restored.GetElapsedMilliseconds(now.AddSeconds(5)) == 5000, "running state includes closed time");
        Assert(engine.Pause(now.AddSeconds(3)), "pause succeeds");
        Assert(engine.Current.Timer.ElapsedMilliseconds == 3000, "pause accumulates");
        Assert(engine.Pause(now.AddSeconds(4)), "duplicate pause is successful no-op");
        Assert(store.SaveCount == 2, "duplicate pause does not save");
        Assert(engine.Reset(), "reset succeeds");
        Assert(engine.Current.Timer.ElapsedMilliseconds == 0 && !engine.Current.Timer.IsRunning, "reset clears timer");

        var atomicStore = new CountingStore();
        var atomic = new TimerEngine(AppState.CreateDefault(), atomicStore);
        Assert(atomic.Start(
            now,
            new DraftState { TaskNumber = "1234", DevNumber = "D1", JobName = "원자 시작", Memo = "memo" },
            new SettingsState { AutoStart = true, MinuteDisplay = true, TopMost = true }), "start accepts draft");
        Assert(atomicStore.SaveCount == 1, "start with draft saves once");
        Assert(atomic.Current.Timer.IsRunning && atomic.Current.Draft.JobName == "원자 시작",
            "start commits timer and draft together");
        Assert(atomic.Current.Settings.TopMost, "start persists topmost setting");

        var failedStart = new TimerEngine(AppState.CreateDefault(), new FailingStore());
        Assert(!failedStart.Start(now, new DraftState { JobName = "저장 실패" }, new SettingsState()),
            "start with draft reports save failure");
        Assert(!failedStart.Current.Timer.IsRunning && failedStart.Current.Draft.JobName == "기타업무",
            "failed start rolls back timer and draft");

        var invalid = AppState.CreateDefault();
        invalid.Timer.IsRunning = true;
        invalid.Timer.StartedAtUtc = null;
        Assert(StateStore.NormalizeLoadedState(invalid), "load reports running repair");
        Assert(!invalid.Timer.IsRunning, "load repairs missing running start");
        invalid.Timer.StartedAtUtc = now;
        Assert(StateStore.NormalizeLoadedState(invalid), "load reports paused repair");
        Assert(invalid.Timer.StartedAtUtc is null, "load clears paused start");
    }

    private static void HistoryTransitions()
    {
        var now = new DateTimeOffset(2026, 7, 31, 1, 0, 0, TimeSpan.Zero);
        var store = new CountingStore();
        var engine = new TimerEngine(AppState.CreateDefault(), store);
        engine.Start(now);
        var beforeComplete = store.SaveCount;
        engine.Complete(
            now.AddMinutes(2),
            new DraftState { TaskNumber = "", DevNumber = "D1", JobName = "", Memo = "memo" },
            new SettingsState());
        Assert(store.SaveCount == beforeComplete + 1, "complete and pending draft save once");
        var entry = engine.Current.History.Single();
        Assert(entry.TaskNumber == "6467" && entry.JobName == "기타업무", "complete normalizes defaults");
        Assert(entry.ElapsedMilliseconds == 120000, "complete stores elapsed");
        Assert(engine.Current.ActiveHistoryId is null, "complete clears active");
        Assert(engine.ResumeHistory(entry.Id, now.AddMinutes(3)), "resume history succeeds");
        Assert(engine.Current.ActiveHistoryId == entry.Id && engine.Current.Timer.IsRunning, "resume sets active");
        engine.Complete(now.AddMinutes(4));
        Assert(engine.Current.History.Count == 1, "active complete updates same entry");
        Assert(engine.Current.History[0].ElapsedMilliseconds == 180000, "active complete extends elapsed");

        var duplicated = engine.DuplicateHistory(entry.Id, now.AddMinutes(5));
        Assert(duplicated is not null && duplicated.Id != entry.Id, "duplicate creates a new entry");
        Assert(duplicated!.TaskNumber == entry.TaskNumber && duplicated.DevNumber == entry.DevNumber &&
               duplicated.JobName == entry.JobName && duplicated.Memo == "" &&
               duplicated.ElapsedMilliseconds == 0 && !duplicated.Completed,
            "duplicate copies work info only");

        var second = new HistoryEntry
        {
            Id = Guid.NewGuid(),
            TaskNumber = "2",
            JobName = "두번째",
            CreatedAtUtc = now.AddMinutes(5),
            LastModifiedUtc = now.AddMinutes(5),
            ElapsedMilliseconds = 5000
        };
        var initial = engine.Current.Clone();
        initial.History.Add(second);
        var transitionStore = new CountingStore();
        var transition = new TimerEngine(initial, transitionStore);
        transition.Start(now.AddMinutes(6));
        var before = transitionStore.SaveCount;
        transition.ResumeHistory(second.Id, now.AddMinutes(7));
        Assert(transitionStore.SaveCount == before + 1, "session switch saves atomically once");
        Assert(transition.Current.ActiveHistoryId == second.Id, "session switch activates selected");

        var missingActive = initial.Clone();
        missingActive.ActiveHistoryId = Guid.NewGuid();
        missingActive.Timer.ElapsedMilliseconds = 9000;
        var repair = new TimerEngine(missingActive, new CountingStore());
        repair.ResumeHistory(second.Id, now.AddMinutes(8));
        Assert(repair.Current.ActiveHistoryId is null, "missing active id is repaired");
        Assert(repair.Current.Timer.ElapsedMilliseconds == 9000, "missing active repair keeps timer");

        var autoState = AppState.CreateDefault();
        autoState.Settings.AutoStart = true;
        var auto = new TimerEngine(autoState, new CountingStore());
        auto.Complete(now);
        Assert(!auto.Current.Timer.IsRunning && auto.Current.Timer.StartedAtUtc is null,
            "complete always stops timer");
        Assert(auto.Current.Settings.AutoStart, "complete preserves legacy auto start setting");
    }

    private static void LoadAndStore()
    {
        var directory = Path.Combine(Path.GetTempPath(), $"TimerDesktopTest-{Guid.NewGuid():N}");
        try
        {
            var store = new StateStore(directory);
            var state = AppState.CreateDefault();
            state.Draft.Memo = "round trip";
            state.Settings.TopMost = true;
            store.Save(state);
            var loaded = store.Load(out var warning);
            Assert(warning is null && loaded.Draft.Memo == "round trip" && loaded.Settings.TopMost,
                "state round trip");

            state.Draft.Memo = "replacement";
            store.Save(state);
            loaded = store.Load(out warning);
            Assert(loaded.Draft.Memo == "replacement", "existing state is replaced");
            var backup = File.ReadAllText(Path.Combine(directory, "state.backup.json"));
            Assert(backup.Contains("round trip"), "atomic replace keeps previous backup");

            File.WriteAllText(store.FilePath, "{ broken");
            loaded = store.Load(out warning);
            Assert(warning is not null && loaded.Draft.TaskNumber == "6467", "corrupt state recovers");
            Assert(Directory.EnumerateFiles(directory, "state.corrupt.*.json").Any(), "corrupt state is preserved");

            File.WriteAllText(store.FilePath, "{\"History\":[null]}");
            loaded = store.Load(out warning);
            Assert(warning is not null && loaded.History.Count == 0, "semantic corruption recovers");

            var committed = AppState.CreateDefault();
            var engine = new TimerEngine(committed, new FailingStore());
            Assert(!engine.Start(DateTimeOffset.UtcNow), "save failure is reported");
            Assert(!engine.Current.Timer.IsRunning, "save failure rolls back memory");
        }
        finally
        {
            if (Directory.Exists(directory))
            {
                Directory.Delete(directory, true);
            }
        }
    }

    private static void TsvGolden()
    {
        var created = new DateTimeOffset(2026, 7, 31, 9, 10, 0, TimeZoneInfo.Local.GetUtcOffset(
            new DateTime(2026, 7, 31, 9, 10, 0)));
        var entry = new HistoryEntry
        {
            TaskNumber = "6467",
            DevNumber = "D\t1",
            JobName = "잡",
            Memo = "한줄\r\n두줄",
            ElapsedMilliseconds = 125999,
            CreatedAtUtc = created.ToUniversalTime(),
            LastModifiedUtc = created.ToUniversalTime()
        };
        var date = DateOnly.FromDateTime(entry.CreatedAtUtc.LocalDateTime);
        var standard = TsvExporter.CreateStandard([entry], date);
        var cells = standard.Split('\t');
        Assert(cells.Length == 18, "standard TSV has 18 columns");
        Assert(cells[0] == "2026-07-31" && cells[13] == "한줄  두줄" && cells[17] == "2026-07",
            "standard TSV column positions");
        Assert(!standard.Contains('\r') && !standard.Contains('\n'), "standard TSV sanitizes newlines");
        Assert(TsvExporter.CreateCompact([entry], date) == "6467\tD 1\t잡\t2\t한줄  두줄",
            "compact TSV golden");
        Assert(TsvExporter.FormatElapsed(63 * 60_000 + 38_000, true) == "64분",
            "minute display rounds total minutes");
        var earlier = entry.Clone();
        earlier.Id = Guid.NewGuid();
        earlier.TaskNumber = "first";
        earlier.CreatedAtUtc = entry.CreatedAtUtc.AddMinutes(-1);
        earlier.Completed = true;
        var later = entry.Clone();
        later.Id = Guid.NewGuid();
        later.TaskNumber = "last";
        later.CreatedAtUtc = entry.CreatedAtUtc.AddMinutes(1);
        var ordered = TsvExporter.CreateCompact([later, entry, earlier], date).Split(Environment.NewLine);
        Assert(ordered.Length == 3 && ordered[0].StartsWith("first\t") && ordered[2].StartsWith("last\t"),
            "TSV includes mixed states in creation order");
        var otherDate = entry.Clone();
        otherDate.TaskNumber = "other";
        otherDate.CreatedAtUtc = entry.CreatedAtUtc.AddDays(1);
        Assert(!TsvExporter.CreateCompact([entry, otherDate], date).Contains("other\t"),
            "TSV excludes another local date");
        Assert(TsvExporter.TryParseElapsed("12:34:56", out var elapsed) &&
               elapsed == 45_296_000, "elapsed parser");
        Assert(!TsvExporter.TryParseElapsed("1:60", out _), "elapsed parser rejects invalid minutes");
    }

    private static void Assert(bool condition, string message)
    {
        _assertions++;
        if (!condition)
        {
            throw new InvalidOperationException(message);
        }
    }

    private sealed class CountingStore : IStateStore
    {
        public int SaveCount { get; private set; }
        public void Save(AppState state) => SaveCount++;
    }

    private sealed class FailingStore : IStateStore
    {
        public void Save(AppState state) => throw new IOException("expected failure");
    }
}
