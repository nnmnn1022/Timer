using System.Text.Json;

namespace TimerDesktop;

internal interface IStateStore
{
    void Save(AppState state);
}

internal sealed class StateStore : IStateStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };

    public StateStore(string? directory = null)
    {
        DirectoryPath = directory ??
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Timer");
        FilePath = Path.Combine(DirectoryPath, "state.json");
    }

    public string DirectoryPath { get; }
    public string FilePath { get; }

    public AppState Load(out string? warning)
    {
        warning = null;
        Directory.CreateDirectory(DirectoryPath);
        DeleteStaleTemporaryFiles();

        if (!File.Exists(FilePath))
        {
            return AppState.CreateDefault();
        }

        try
        {
            var json = File.ReadAllText(FilePath);
            var state = JsonSerializer.Deserialize<AppState>(json, JsonOptions)
                ?? throw new JsonException("상태 파일의 루트가 비어 있습니다.");
            if (state.History is not null &&
                state.History.Cast<HistoryEntry?>().Any(x => x is null))
            {
                throw new JsonException("내역에 null 항목이 있습니다.");
            }

            if (NormalizeLoadedState(state))
            {
                try
                {
                    Save(state);
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                {
                    warning = $"복구한 상태를 저장하지 못했습니다.\n{ex.Message}";
                }
            }
            return state;
        }
        catch (Exception ex) when (ex is JsonException or NotSupportedException)
        {
            var corruptPath = Path.Combine(
                DirectoryPath,
                $"state.corrupt.{DateTime.Now:yyyyMMdd-HHmmssfff}.json");
            File.Move(FilePath, corruptPath);
            warning = $"상태 파일이 손상되어 기본 상태로 시작합니다.\n보존 위치: {corruptPath}";
            return AppState.CreateDefault();
        }
    }

    public void Save(AppState state)
    {
        Directory.CreateDirectory(DirectoryPath);
        var tempPath = Path.Combine(DirectoryPath, $"state.{Guid.NewGuid():N}.tmp");
        var backupPath = Path.Combine(DirectoryPath, "state.backup.json");

        try
        {
            var json = JsonSerializer.Serialize(state, JsonOptions);
            File.WriteAllText(tempPath, json);

            if (File.Exists(FilePath))
            {
                File.Replace(tempPath, FilePath, backupPath, true);
            }
            else
            {
                File.Move(tempPath, FilePath);
            }
        }
        finally
        {
            if (File.Exists(tempPath))
            {
                File.Delete(tempPath);
            }
        }
    }

    private void DeleteStaleTemporaryFiles()
    {
        foreach (var file in Directory.EnumerateFiles(DirectoryPath, "state.*.tmp"))
        {
            try
            {
                File.Delete(file);
            }
            catch (IOException)
            {
                // Another live process may still own the file.
            }
            catch (UnauthorizedAccessException)
            {
                // A stale file must never prevent loading the committed state.
            }
        }
    }

    internal static bool NormalizeLoadedState(AppState state)
    {
        var before = JsonSerializer.Serialize(state, JsonOptions);
        state.SchemaVersion = 1;
        state.Timer ??= new TimerState();
        state.Draft ??= new DraftState();
        state.Settings ??= new SettingsState();
        state.History ??= [];
        state.Timer.ElapsedMilliseconds = Math.Max(0, state.Timer.ElapsedMilliseconds);

        if (state.Timer.IsRunning && state.Timer.StartedAtUtc is null)
        {
            state.Timer.IsRunning = false;
        }
        else if (!state.Timer.IsRunning)
        {
            state.Timer.StartedAtUtc = null;
        }

        state.Draft.Normalize();
        foreach (var entry in state.History)
        {
            entry.TaskNumber = string.IsNullOrWhiteSpace(entry.TaskNumber) ? "6467" : entry.TaskNumber.Trim();
            entry.DevNumber = entry.DevNumber?.Trim() ?? "";
            entry.JobName = string.IsNullOrWhiteSpace(entry.JobName) ? "기타업무" : entry.JobName.Trim();
            entry.Memo ??= "";
            entry.ElapsedMilliseconds = Math.Max(0, entry.ElapsedMilliseconds);
        }

        if (state.ActiveHistoryId is Guid activeId && state.History.All(x => x.Id != activeId))
        {
            state.ActiveHistoryId = null;
        }

        return before != JsonSerializer.Serialize(state, JsonOptions);
    }
}
