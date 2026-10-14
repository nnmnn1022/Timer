namespace TimerDesktop;

internal sealed class TimerEngine
{
    private readonly IStateStore _store;
    private readonly object _sync = new();
    private Task<bool> _pendingSave = Task.FromResult(true);

    public TimerEngine(AppState initialState, IStateStore store)
    {
        Current = initialState;
        _store = store;
    }

    public AppState Current { get; private set; }
    public string? LastError { get; private set; }

    public long GetElapsedMilliseconds(DateTimeOffset nowUtc)
    {
        var timer = Current.Timer;
        if (!timer.IsRunning || timer.StartedAtUtc is null)
        {
            return Math.Max(0, timer.ElapsedMilliseconds);
        }

        var running = Math.Max(0, (long)(nowUtc - timer.StartedAtUtc.Value).TotalMilliseconds);
        return Math.Max(0, timer.ElapsedMilliseconds + running);
    }

    public bool Start(
        DateTimeOffset nowUtc,
        DraftState? draft = null,
        SettingsState? settings = null) => Commit(candidate =>
    {
        var draftChanged = ApplyDraft(candidate, draft, settings);
        if (candidate.Timer.IsRunning)
        {
            return draftChanged;
        }

        candidate.Timer.IsRunning = true;
        candidate.Timer.StartedAtUtc = nowUtc;
        return true;
    });

    public bool Pause(DateTimeOffset nowUtc) => Commit(candidate =>
    {
        if (!candidate.Timer.IsRunning)
        {
            return false;
        }

        candidate.Timer.ElapsedMilliseconds = Elapsed(candidate.Timer, nowUtc);
        candidate.Timer.IsRunning = false;
        candidate.Timer.StartedAtUtc = null;
        return true;
    });

    public bool Reset() => Commit(candidate =>
    {
        candidate.Timer = new TimerState();
        candidate.ActiveHistoryId = null;
        return true;
    });

    public bool Complete(
        DateTimeOffset nowUtc,
        DraftState? draft = null,
        SettingsState? settings = null) => Commit(candidate =>
    {
        ApplyDraft(candidate, draft, settings);
        CompleteCurrent(candidate, nowUtc);
        ResetAfterComplete(candidate);
        return true;
    });

    public bool ResumeHistory(
        Guid id,
        DateTimeOffset nowUtc,
        DraftState? draft = null,
        SettingsState? settings = null) => Commit(candidate =>
    {
        var draftChanged = ApplyDraft(candidate, draft, settings);
        if (candidate.ActiveHistoryId is Guid activeId &&
            candidate.History.All(x => x.Id != activeId))
        {
            candidate.ActiveHistoryId = null;
            return true;
        }

        if (candidate.ActiveHistoryId == id && candidate.Timer.IsRunning)
        {
            return draftChanged;
        }

        var selected = candidate.History.FirstOrDefault(x => x.Id == id);
        if (selected is null)
        {
            if (candidate.ActiveHistoryId is null)
            {
                return draftChanged;
            }

            candidate.ActiveHistoryId = null;
            return true;
        }

        if (HasCurrentSession(candidate))
        {
            CompleteCurrent(candidate, nowUtc);
            selected = candidate.History.First(x => x.Id == id);
        }

        candidate.Draft = new DraftState
        {
            TaskNumber = selected.TaskNumber,
            DevNumber = selected.DevNumber,
            JobName = selected.JobName,
            Memo = selected.Memo
        };
        candidate.Timer = new TimerState
        {
            IsRunning = true,
            StartedAtUtc = nowUtc,
            ElapsedMilliseconds = selected.ElapsedMilliseconds
        };
        candidate.ActiveHistoryId = selected.Id;
        return true;
    });

    public bool SaveDraft(DraftState draft, SettingsState settings, bool force = false) => Commit(candidate =>
    {
        var normalized = draft.Clone();
        normalized.Normalize();
        var changed =
            !DraftEquals(candidate.Draft, normalized) ||
            candidate.Settings.AutoStart != settings.AutoStart ||
            candidate.Settings.MinuteDisplay != settings.MinuteDisplay ||
            candidate.Settings.TopMost != settings.TopMost;

        candidate.Draft = normalized;
        candidate.Settings = settings.Clone();
        return changed || force;
    }, cloneHistory: false);

    public Task<bool> SaveDraftAsync(DraftState draft, SettingsState settings, bool force = false)
    {
        lock (_sync)
        {
            LastError = null;
            var previous = Current;
            var candidate = Current.Clone(cloneHistory: false);
            var normalized = draft.Clone();
            normalized.Normalize();
            var changed =
                !DraftEquals(candidate.Draft, normalized) ||
                candidate.Settings.AutoStart != settings.AutoStart ||
                candidate.Settings.MinuteDisplay != settings.MinuteDisplay ||
                candidate.Settings.TopMost != settings.TopMost;

            if (!changed && !force)
            {
                return Task.FromResult(true);
            }

            candidate.Draft = normalized;
            candidate.Settings = settings.Clone();
            Current = candidate;

            var previousSave = _pendingSave;
            var pending = Task.Run(async () =>
            {
                await previousSave.ConfigureAwait(false);
                return Persist(candidate, previous);
            });
            _pendingSave = pending;
            return pending;
        }
    }

    public bool EditHistory(Guid id, HistoryEntry edited, DateTimeOffset nowUtc) => Commit(candidate =>
    {
        var entry = candidate.History.FirstOrDefault(x => x.Id == id);
        if (entry is null)
        {
            return false;
        }

        entry.TaskNumber = string.IsNullOrWhiteSpace(edited.TaskNumber) ? "6467" : edited.TaskNumber.Trim();
        entry.DevNumber = edited.DevNumber?.Trim() ?? "";
        entry.JobName = string.IsNullOrWhiteSpace(edited.JobName) ? "기타업무" : edited.JobName.Trim();
        entry.Memo = edited.Memo ?? "";
        entry.ElapsedMilliseconds = Math.Max(0, edited.ElapsedMilliseconds);
        entry.Completed = edited.Completed;
        entry.LastModifiedUtc = nowUtc;

        if (candidate.ActiveHistoryId == id)
        {
            candidate.Draft = new DraftState
            {
                TaskNumber = entry.TaskNumber,
                DevNumber = entry.DevNumber,
                JobName = entry.JobName,
                Memo = entry.Memo
            };
            candidate.Timer.ElapsedMilliseconds = entry.ElapsedMilliseconds;
            if (candidate.Timer.IsRunning)
            {
                candidate.Timer.StartedAtUtc = nowUtc;
            }
        }

        return true;
    });

    public bool SetCompleted(Guid id, bool completed, DateTimeOffset nowUtc) => Commit(candidate =>
    {
        var entry = candidate.History.FirstOrDefault(x => x.Id == id);
        if (entry is null || entry.Completed == completed)
        {
            return false;
        }

        entry.Completed = completed;
        entry.LastModifiedUtc = nowUtc;
        return true;
    });

    public HistoryEntry? DuplicateHistory(Guid id, DateTimeOffset nowUtc)
    {
        HistoryEntry? duplicated = null;
        if (!Commit(candidate =>
            {
                var source = candidate.History.FirstOrDefault(x => x.Id == id);
                if (source is null)
                {
                    return false;
                }

                duplicated = new HistoryEntry
                {
                    TaskNumber = source.TaskNumber,
                    DevNumber = source.DevNumber,
                    JobName = source.JobName,
                    CreatedAtUtc = nowUtc,
                    LastModifiedUtc = nowUtc
                };
                candidate.History.Add(duplicated);
                return true;
            }))
        {
            return null;
        }

        return duplicated?.Clone();
    }

    public bool DeleteHistory(Guid id) => Commit(candidate =>
    {
        var removed = candidate.History.RemoveAll(x => x.Id == id) > 0;
        if (removed && candidate.ActiveHistoryId == id)
        {
            candidate.ActiveHistoryId = null;
        }
        return removed;
    });

    public bool ClearHistory() => Commit(candidate =>
    {
        if (candidate.History.Count == 0)
        {
            return false;
        }
        candidate.History.Clear();
        candidate.ActiveHistoryId = null;
        return true;
    });

    public bool SaveCurrent() => Commit(_ => true);

    public IReadOnlyList<HistoryEntry> OrderedHistory()
    {
        var active = Current.ActiveHistoryId;
        return Current.History
            .OrderBy(x => x.Id == active ? 0 : x.Completed ? 2 : 1)
            .ThenByDescending(x => x.LastModifiedUtc)
            .ToList();
    }

    private bool Commit(Func<AppState, bool> mutate, bool cloneHistory = true)
    {
        FlushPendingSave();
        lock (_sync)
        {
            LastError = null;
            var candidate = Current.Clone(cloneHistory);
            if (!mutate(candidate))
            {
                return true;
            }

            try
            {
                _store.Save(candidate);
                Current = candidate;
                return true;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                LastError = ex.Message;
                return false;
            }
        }
    }

    private void FlushPendingSave()
    {
        Task<bool> pending;
        lock (_sync)
        {
            pending = _pendingSave;
        }
        pending.GetAwaiter().GetResult();
    }

    private bool Persist(AppState candidate, AppState previous)
    {
        try
        {
            _store.Save(candidate);
            lock (_sync)
            {
                if (ReferenceEquals(Current, candidate))
                {
                    LastError = null;
                }
            }
            return true;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            lock (_sync)
            {
                if (ReferenceEquals(Current, candidate))
                {
                    Current = previous;
                }
                LastError = ex.Message;
            }
            return false;
        }
    }

    private static bool HasCurrentSession(AppState state) =>
        state.Timer.IsRunning || state.Timer.ElapsedMilliseconds > 0 || state.ActiveHistoryId is not null;

    private static bool ApplyDraft(AppState state, DraftState? draft, SettingsState? settings)
    {
        var changed = false;
        if (draft is not null)
        {
            var normalized = draft.Clone();
            normalized.Normalize();
            changed = !DraftEquals(state.Draft, normalized);
            state.Draft = normalized;
        }
        if (settings is not null)
        {
            changed |= state.Settings.AutoStart != settings.AutoStart ||
                       state.Settings.MinuteDisplay != settings.MinuteDisplay ||
                       state.Settings.TopMost != settings.TopMost;
            state.Settings = settings.Clone();
        }
        return changed;
    }

    private static void CompleteCurrent(AppState state, DateTimeOffset nowUtc)
    {
        state.Draft.Normalize();
        var elapsed = Elapsed(state.Timer, nowUtc);
        var entry = state.ActiveHistoryId is Guid id
            ? state.History.FirstOrDefault(x => x.Id == id)
            : null;

        if (entry is null)
        {
            entry = new HistoryEntry
            {
                Id = Guid.NewGuid(),
                CreatedAtUtc = nowUtc
            };
            state.History.Add(entry);
        }

        entry.TaskNumber = state.Draft.TaskNumber;
        entry.DevNumber = state.Draft.DevNumber;
        entry.JobName = state.Draft.JobName;
        entry.Memo = state.Draft.Memo;
        entry.ElapsedMilliseconds = elapsed;
        entry.LastModifiedUtc = nowUtc;
        state.ActiveHistoryId = null;
    }

    private static void ResetAfterComplete(AppState state)
    {
        state.Draft = new DraftState();
        state.Timer = new TimerState();
    }

    private static long Elapsed(TimerState timer, DateTimeOffset nowUtc)
    {
        var elapsed = Math.Max(0, timer.ElapsedMilliseconds);
        if (timer.IsRunning && timer.StartedAtUtc is not null)
        {
            elapsed += Math.Max(0, (long)(nowUtc - timer.StartedAtUtc.Value).TotalMilliseconds);
        }
        return elapsed;
    }

    private static bool DraftEquals(DraftState left, DraftState right) =>
        left.TaskNumber == right.TaskNumber &&
        left.DevNumber == right.DevNumber &&
        left.JobName == right.JobName &&
        left.Memo == right.Memo;
}
