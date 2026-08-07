using System.Drawing.Drawing2D;

namespace TimerDesktop;

internal sealed class MainForm : Form
{
    private static readonly Color SurfaceColor = Color.White;
    private static readonly Color TextColor = Color.FromArgb(31, 51, 73);
    private static readonly Color MutedTextColor = Color.FromArgb(103, 118, 129);
    private static readonly Color AccentColor = Color.FromArgb(47, 145, 119);
    private static readonly Color DangerColor = Color.FromArgb(185, 72, 72);

    private readonly TimerEngine _engine;
    private readonly System.Windows.Forms.Timer _displayTimer = new() { Interval = 1000 };
    private readonly System.Windows.Forms.Timer _draftTimer = new() { Interval = 500 };
    private readonly ToolTip _toolTip = new();
    private readonly Label _timerLabel = new();
    private readonly TextBox _taskText = new();
    private readonly TextBox _devText = new();
    private readonly TextBox _jobText = new();
    private readonly TextBox _memoText = new();
    private readonly CheckBox _minuteDisplayCheck = new();
    private readonly CheckBox _topMostCheck = new();
    private readonly RoundedButton _startStopButton = new();
    private readonly RoundedButton _copyButton = new();
    private readonly RoundedButton _copy2Button = new();
    private readonly RoundedButton _deleteButton = new();
    private readonly RoundedButton _clearButton = new();
    private readonly Panel _historyScroll = new();
    private readonly TableLayoutPanel _historyList = new();
    private Guid? _selectedHistoryId;
    private long _lastStartStopClick;
    private bool _processing;
    private bool _refreshing;
    private bool _draftDirty;

    public MainForm(TimerEngine engine, Icon icon)
    {
        _engine = engine;
        Icon = icon;
        Text = "Timer";
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(504, 650);
        MinimumSize = new Size(480, 540);
        BackColor = Color.FromArgb(244, 247, 249);
        Font = new Font("Malgun Gothic", 9F);
        AutoScaleMode = AutoScaleMode.Dpi;
        TopMost = false;

        Controls.Add(BuildLayout());
        WireEvents();
        RefreshAll();
    }

    public bool AllowExit { get; set; }

    public bool TrySavePending()
    {
        _draftTimer.Stop();
        if (_draftDirty)
        {
            return SaveDraft(showError: true, force: true);
        }

        var ok = _engine.SaveCurrent();
        if (!ok)
        {
            ShowSaveError();
        }
        return ok;
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (!AllowExit && e.CloseReason == CloseReason.UserClosing)
        {
            e.Cancel = true;
            _draftTimer.Stop();
            if (SaveDraft(showError: true, force: true))
            {
                Hide();
            }
            return;
        }
        base.OnFormClosing(e);
    }

    protected override void OnVisibleChanged(EventArgs e)
    {
        base.OnVisibleChanged(e);
        if (Visible)
        {
            RefreshAll();
            _displayTimer.Start();
        }
        else
        {
            _displayTimer.Stop();
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _displayTimer.Dispose();
            _draftTimer.Dispose();
            _toolTip.Dispose();
        }
        base.Dispose(disposing);
    }

    private Control BuildLayout()
    {
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(14),
            ColumnCount = 1,
            RowCount = 5,
            BackColor = BackColor
        };
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        _timerLabel.Dock = DockStyle.Top;
        _timerLabel.Height = 58;
        _timerLabel.TextAlign = ContentAlignment.MiddleCenter;
        _timerLabel.Font = new Font("Segoe UI", 27F, FontStyle.Bold);
        _timerLabel.ForeColor = TextColor;
        root.Controls.Add(_timerLabel, 0, 0);
        root.Controls.Add(BuildInputCard(), 0, 1);
        root.Controls.Add(BuildSettings(), 0, 2);
        root.Controls.Add(BuildCommands(), 0, 3);
        root.Controls.Add(BuildHistorySurface(), 0, 4);
        return root;
    }

    private Control BuildInputCard()
    {
        var card = new RoundedPanel
        {
            Dock = DockStyle.Top,
            Height = 146,
            Padding = new Padding(7),
            Margin = new Padding(0, 0, 0, 8),
            BackColor = Color.FromArgb(232, 238, 242),
            BorderColor = Color.FromArgb(210, 221, 228),
            Radius = 14
        };
        var input = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 3,
            BackColor = Color.Transparent
        };
        input.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        input.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        input.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
        input.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));
        input.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        ConfigureTextBox(_taskText, "작업번호");
        ConfigureTextBox(_devText, "개발번호");
        ConfigureTextBox(_jobText, "잡명");
        ConfigureTextBox(_memoText, "메모", multiline: true);
        input.Controls.Add(CreateInputHost(_taskText), 0, 0);
        input.Controls.Add(CreateInputHost(_devText), 1, 0);
        input.Controls.Add(CreateInputHost(_jobText), 0, 1);
        input.SetColumnSpan(input.GetControlFromPosition(0, 1)!, 2);
        input.Controls.Add(CreateInputHost(_memoText), 0, 2);
        input.SetColumnSpan(input.GetControlFromPosition(0, 2)!, 2);
        card.Controls.Add(input);
        return card;
    }

    private Control BuildSettings()
    {
        var settings = new FlowLayoutPanel
        {
            AutoSize = true,
            WrapContents = false,
            BackColor = Color.Transparent,
            Margin = new Padding(0, 0, 0, 7)
        };
        _minuteDisplayCheck.Text = "분 단위 표시";
        _topMostCheck.Text = "항상 위";
        foreach (var check in new[] { _minuteDisplayCheck, _topMostCheck })
        {
            check.AutoSize = true;
            check.ForeColor = TextColor;
            check.Margin = new Padding(8, 3, 8, 3);
        }
        settings.Controls.AddRange([_minuteDisplayCheck, _topMostCheck]);
        return Centered(settings);
    }

    private Control BuildHistorySurface()
    {
        var surface = new RoundedPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(6),
            Margin = new Padding(0, 0, 0, 7),
            BackColor = Color.FromArgb(232, 238, 242),
            BorderColor = Color.FromArgb(210, 221, 228),
            Radius = 14
        };
        _historyScroll.Dock = DockStyle.Fill;
        _historyScroll.AutoScroll = true;
        _historyScroll.BackColor = Color.FromArgb(232, 238, 242);
        _historyList.Dock = DockStyle.Top;
        _historyList.AutoSize = true;
        _historyList.ColumnCount = 1;
        _historyList.RowCount = 0;
        _historyList.Padding = new Padding(1);
        _historyList.BackColor = Color.FromArgb(232, 238, 242);
        _historyList.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        _historyScroll.Controls.Add(_historyList);
        surface.Controls.Add(_historyScroll);
        return surface;
    }

    private Control BuildCommands()
    {
        var commands = new FlowLayoutPanel
        {
            AutoSize = true,
            WrapContents = false,
            BackColor = Color.Transparent,
            Margin = new Padding(0, 2, 0, 0)
        };
        ConfigureIconButton(_startStopButton, "▶", "시작", AccentColor);
        ConfigureIconButton(_copyButton, "⧉", "복사", Color.FromArgb(74, 111, 138));
        ConfigureIconButton(_copy2Button, "⧉²", "복사2", Color.FromArgb(74, 111, 138));
        ConfigureIconButton(_deleteButton, "✕", "선택 삭제", Color.FromArgb(216, 106, 106));
        ConfigureIconButton(_clearButton, "✕✕", "전체 삭제", Color.FromArgb(190, 61, 61));
        commands.Controls.AddRange(
            [_startStopButton, _copyButton, _copy2Button, _deleteButton, _clearButton]);

        _startStopButton.Click += (_, _) => StartOrStop();
        _copyButton.Click += (_, _) => CopySelected(compact: false);
        _copy2Button.Click += (_, _) => CopySelected(compact: true);
        _deleteButton.Click += (_, _) => DeleteSelected();
        _clearButton.Click += (_, _) => ClearAll();
        return Centered(commands);
    }

    private void WireEvents()
    {
        _displayTimer.Tick += (_, _) => RefreshTimer();
        _draftTimer.Tick += (_, _) =>
        {
            _draftTimer.Stop();
            SaveDraft(showError: true);
        };
        foreach (var control in new Control[] { _taskText, _devText, _jobText, _memoText })
        {
            control.TextChanged += (_, _) => MarkDraftDirty();
            control.MouseDown += (_, _) => ClearHistorySelection();
            control.Enter += (_, _) => ClearHistorySelection();
        }
        _minuteDisplayCheck.CheckedChanged += (_, _) =>
        {
            MarkDraftDirty();
            RefreshTimer();
            RefreshHistory();
        };
        _topMostCheck.CheckedChanged += (_, _) =>
        {
            TopMost = _topMostCheck.Checked;
            MarkDraftDirty();
        };
    }

    private void StartOrStop()
    {
        var nowTicks = Environment.TickCount64;
        if (_lastStartStopClick != 0 &&
            nowTicks - _lastStartStopClick < SystemInformation.DoubleClickTime)
        {
            return;
        }
        _lastStartStopClick = nowTicks;

        var nowUtc = DateTimeOffset.UtcNow;
        if (_engine.Current.Timer.IsRunning)
        {
            RunCommand(
                () => _engine.Complete(nowUtc, ReadDraft(), ReadSettings()),
                includeDraft: true);
            return;
        }

        var selected = SelectedEntry();
        if (selected is not null)
        {
            RunCommand(
                () => _engine.ResumeHistory(selected.Id, nowUtc, ReadDraft(), ReadSettings()),
                includeDraft: true);
            return;
        }

        RunCommand(
            () => _engine.Start(nowUtc, ReadDraft(), ReadSettings()),
            includeDraft: true);
    }

    private void MarkDraftDirty()
    {
        if (_refreshing)
        {
            return;
        }
        _draftDirty = true;
        _draftTimer.Stop();
        _draftTimer.Start();
    }

    private bool SaveDraft(bool showError, bool force = false)
    {
        if (!_draftDirty && !force)
        {
            return true;
        }

        var ok = _engine.SaveDraft(ReadDraft(), ReadSettings(), force);
        if (ok)
        {
            _draftDirty = false;
        }
        else if (showError)
        {
            ShowSaveError();
        }
        return ok;
    }

    private bool RunCommand(Func<bool> command, bool includeDraft = false)
    {
        if (_processing)
        {
            return false;
        }

        _processing = true;
        try
        {
            _draftTimer.Stop();
            if ((!includeDraft && !SaveDraft(showError: true)) || !command())
            {
                if (_engine.LastError is not null)
                {
                    ShowSaveError();
                }
                return false;
            }
            RefreshAll();
            return true;
        }
        finally
        {
            _processing = false;
        }
    }

    private DraftState ReadDraft() => new()
    {
        TaskNumber = _taskText.Text,
        DevNumber = _devText.Text,
        JobName = _jobText.Text,
        Memo = _memoText.Text
    };

    private SettingsState ReadSettings() => new()
    {
        AutoStart = _engine.Current.Settings.AutoStart,
        MinuteDisplay = _minuteDisplayCheck.Checked,
        TopMost = _topMostCheck.Checked
    };

    private void RefreshAll()
    {
        _refreshing = true;
        try
        {
            var state = _engine.Current;
            _taskText.Text = state.Draft.TaskNumber;
            _devText.Text = state.Draft.DevNumber;
            _jobText.Text = state.Draft.JobName;
            _memoText.Text = state.Draft.Memo;
            _minuteDisplayCheck.Checked = state.Settings.MinuteDisplay;
            _topMostCheck.Checked = state.Settings.TopMost;
            TopMost = state.Settings.TopMost;
            _draftDirty = false;
            RefreshTimer();
            RefreshHistory();
        }
        finally
        {
            _refreshing = false;
        }
    }

    private void RefreshTimer()
    {
        _timerLabel.Text = TsvExporter.FormatElapsed(
            _engine.GetElapsedMilliseconds(DateTimeOffset.UtcNow),
            _minuteDisplayCheck.Checked);
        var running = _engine.Current.Timer.IsRunning;
        _startStopButton.Text = running ? "■" : "▶";
        _startStopButton.AccessibleName = running ? "멈춤" : "시작";
        _startStopButton.BackColor = running ? Color.FromArgb(218, 133, 55) : AccentColor;
        _toolTip.SetToolTip(_startStopButton, running ? "멈추고 완료" : "시작 또는 선택 내역 재실행");
    }

    private void RefreshHistory()
    {
        if (_selectedHistoryId is Guid selectedId &&
            _engine.Current.History.All(x => x.Id != selectedId))
        {
            _selectedHistoryId = null;
        }

        _historyList.SuspendLayout();
        try
        {
            while (_historyList.Controls.Count > 0)
            {
                _historyList.Controls[0].Dispose();
            }
            _historyList.RowStyles.Clear();
            _historyList.RowCount = 0;
            DateOnly? lastDate = null;
            foreach (var entry in _engine.OrderedHistory())
            {
                var entryDate = DateOnly.FromDateTime(entry.CreatedAtUtc.LocalDateTime);
                if (lastDate != entryDate)
                {
                    var header = CreateHistoryDateHeader(entryDate);
                    var headerRow = _historyList.RowCount++;
                    _historyList.RowStyles.Add(new RowStyle(SizeType.AutoSize));
                    _historyList.Controls.Add(header, 0, headerRow);
                    lastDate = entryDate;
                }

                var card = CreateHistoryCard(entry);
                var row = _historyList.RowCount++;
                _historyList.RowStyles.Add(new RowStyle(SizeType.AutoSize));
                _historyList.Controls.Add(card, 0, row);
            }
        }
        finally
        {
            _historyList.ResumeLayout(true);
        }
        UpdateHistorySelection();
    }

    private static Label CreateHistoryDateHeader(DateOnly date)
    {
        return new Label
        {
            Text = FormatHistoryDateHeader(date),
            Dock = DockStyle.Top,
            AutoSize = true,
            Margin = new Padding(4, 12, 4, 5),
            Padding = new Padding(8, 4, 8, 4),
            BackColor = Color.FromArgb(47, 145, 119),
            ForeColor = Color.White,
            Font = new Font("Malgun Gothic", 9F, FontStyle.Bold),
            TextAlign = ContentAlignment.MiddleLeft
        };
    }

    private static string FormatHistoryDateHeader(DateOnly date)
    {
        var today = DateOnly.FromDateTime(DateTime.Now);
        if (date == today)
        {
            return $"오늘 · {date:yyyy-MM-dd}";
        }
        if (date == today.AddDays(-1))
        {
            return $"어제 · {date:yyyy-MM-dd}";
        }
        return date.ToString("yyyy-MM-dd");
    }

    private RoundedPanel CreateHistoryCard(HistoryEntry entry)
    {
        var card = new RoundedPanel
        {
            Tag = entry.Id,
            Dock = DockStyle.Top,
            AutoSize = true,
            MinimumSize = new Size(0, 104),
            Margin = new Padding(3, 3, 3, 5),
            Padding = new Padding(10, 7, 10, 7),
            Radius = 12
        };
        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            ColumnCount = 2,
            RowCount = 3,
            BackColor = Color.Transparent,
            Margin = Padding.Empty,
            Padding = Padding.Empty
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 112));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 20));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 20));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));

        var workText = string.IsNullOrWhiteSpace(entry.DevNumber)
            ? $"작업 {entry.TaskNumber}  ·  개발번호 없음"
            : $"작업 {entry.TaskNumber}  ·  개발 {entry.DevNumber}";
        var work = CreateCardLabel(workText, FontStyle.Bold, TextColor);
        var job = CreateCardLabel(entry.JobName, FontStyle.Regular, TextColor);
        var memo = new TextBox
        {
            Text = string.IsNullOrWhiteSpace(entry.Memo) ? "메모 없음" : entry.Memo,
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Vertical,
            WordWrap = true,
            BorderStyle = BorderStyle.None,
            BackColor = SurfaceColor,
            ForeColor = MutedTextColor,
            Dock = DockStyle.Fill,
            TabStop = false,
            Margin = Padding.Empty,
            Font = new Font("Malgun Gothic", 9F)
        };
        var date = CreateCardLabel(entry.CreatedAtUtc.LocalDateTime.ToString("yyyy-MM-dd"),
            FontStyle.Regular, MutedTextColor, ContentAlignment.MiddleRight);
        var time = CreateCardLabel(
            TsvExporter.FormatElapsed(entry.ElapsedMilliseconds, _minuteDisplayCheck.Checked),
            FontStyle.Bold, TextColor, ContentAlignment.MiddleRight);
        var completed = new CheckBox
        {
            Text = "완료",
            Checked = entry.Completed,
            AutoSize = true,
            Anchor = AnchorStyles.Right,
            ForeColor = MutedTextColor,
            Margin = new Padding(3, 1, 0, 1),
            AccessibleName = "완료 상태"
        };

        layout.Controls.Add(work, 0, 0);
        layout.Controls.Add(date, 1, 0);
        layout.Controls.Add(job, 0, 1);
        layout.Controls.Add(time, 1, 1);
        layout.Controls.Add(memo, 0, 2);
        layout.Controls.Add(completed, 1, 2);
        card.Controls.Add(layout);

        var menu = new ContextMenuStrip();
        menu.Items.Add("복제", null, (_, _) => DuplicateHistory(entry.Id));
        menu.Opening += (_, _) => SelectHistory(entry.Id);
        card.ContextMenuStrip = menu;

        completed.CheckedChanged += (_, _) =>
        {
            if (_refreshing)
            {
                return;
            }
            SelectHistory(entry.Id);
            if (!RunCommand(() => _engine.SetCompleted(entry.Id, completed.Checked, DateTimeOffset.UtcNow)))
            {
                RefreshHistory();
            }
        };
        WireCardInteraction(card, entry.Id);
        return card;
    }

    private void WireCardInteraction(Control control, Guid id, ContextMenuStrip? contextMenu = null)
    {
        contextMenu ??= control.ContextMenuStrip;
        if (contextMenu is not null)
        {
            control.ContextMenuStrip = contextMenu;
        }
        if (control is CheckBox)
        {
            return;
        }
        control.Cursor = Cursors.Hand;
        control.MouseClick += (_, e) =>
        {
            if (e.Button == MouseButtons.Left)
            {
                SelectHistory(id);
            }
        };
        control.MouseDoubleClick += (_, e) =>
        {
            if (e.Button == MouseButtons.Left)
            {
                SelectHistory(id);
                EditSelected();
            }
        };
        foreach (Control child in control.Controls)
        {
            WireCardInteraction(child, id, contextMenu);
        }
    }

    private void SelectHistory(Guid id)
    {
        _selectedHistoryId = id;
        UpdateHistorySelection();
    }

    private void ClearHistorySelection()
    {
        if (_selectedHistoryId is null)
        {
            return;
        }
        _selectedHistoryId = null;
        UpdateHistorySelection();
    }

    private void UpdateHistorySelection()
    {
        foreach (var card in _historyList.Controls.OfType<RoundedPanel>())
        {
            if (card.Tag is not Guid id)
            {
                continue;
            }
            var entry = _engine.Current.History.FirstOrDefault(x => x.Id == id);
            if (_selectedHistoryId == id)
            {
                card.BackColor = Color.FromArgb(222, 237, 247);
                card.BorderColor = Color.FromArgb(77, 132, 170);
            }
            else if (_engine.Current.ActiveHistoryId == id)
            {
                card.BackColor = Color.FromArgb(228, 246, 239);
                card.BorderColor = Color.FromArgb(92, 166, 139);
            }
            else if (entry?.Completed == true)
            {
                card.BackColor = Color.FromArgb(239, 242, 244);
                card.BorderColor = Color.FromArgb(207, 214, 219);
            }
            else
            {
                card.BackColor = SurfaceColor;
                card.BorderColor = Color.FromArgb(215, 224, 230);
            }
        }

        var hasSelection = SelectedEntry() is not null;
        _copyButton.Enabled = hasSelection;
        _copy2Button.Enabled = hasSelection;
        _deleteButton.Enabled = hasSelection;
        _clearButton.Enabled = _engine.Current.History.Count > 0;
    }

    private HistoryEntry? SelectedEntry() => _selectedHistoryId is Guid id
        ? _engine.Current.History.FirstOrDefault(x => x.Id == id)
        : null;

    private void WithSelected(Action<HistoryEntry> action)
    {
        var entry = SelectedEntry();
        if (entry is null)
        {
            MessageBox.Show(this, "내역을 선택해 주세요.", "Timer",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        action(entry);
    }

    private void EditSelected() => WithSelected(entry =>
    {
        using var dialog = new HistoryEditForm(entry);
        dialog.TopMost = TopMost;
        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }
        RunCommand(() => _engine.EditHistory(entry.Id, dialog.Result, DateTimeOffset.UtcNow));
    });

    private void DuplicateHistory(Guid id)
    {
        HistoryEntry? duplicated = null;
        RunCommand(() =>
        {
            duplicated = _engine.DuplicateHistory(id, DateTimeOffset.UtcNow);
            if (duplicated is null)
            {
                return false;
            }

            _selectedHistoryId = duplicated.Id;
            return true;
        });
    }

    private void CopySelected(bool compact) => WithSelected(entry =>
    {
        var date = DateOnly.FromDateTime(entry.CreatedAtUtc.LocalDateTime);
        var text = compact
            ? TsvExporter.CreateCompact(_engine.Current.History, date)
            : TsvExporter.CreateStandard(_engine.Current.History, date);
        if (string.IsNullOrEmpty(text))
        {
            MessageBox.Show(this, "복사할 날짜의 내역이 없습니다.", "Timer");
            return;
        }
        Clipboard.SetText(text);
    });

    private void DeleteSelected() => WithSelected(entry =>
    {
        if (MessageBox.Show(this, "선택한 내역을 삭제하시겠습니까?", "Timer",
                MessageBoxButtons.YesNo, MessageBoxIcon.Warning) == DialogResult.Yes)
        {
            RunCommand(() => _engine.DeleteHistory(entry.Id));
        }
    });

    private void ClearAll()
    {
        if (_engine.Current.History.Count > 0 &&
            MessageBox.Show(this, "모든 저장 내역을 삭제하시겠습니까?", "Timer",
                MessageBoxButtons.YesNo, MessageBoxIcon.Warning) == DialogResult.Yes)
        {
            RunCommand(_engine.ClearHistory);
        }
    }

    private void ShowSaveError() =>
        MessageBox.Show(this, $"상태를 저장하지 못했습니다.\n{_engine.LastError}",
            "Timer", MessageBoxButtons.OK, MessageBoxIcon.Error);

    private static Label CreateCardLabel(
        string text,
        FontStyle style,
        Color color,
        ContentAlignment alignment = ContentAlignment.MiddleLeft) => new()
        {
            Text = text,
            Dock = DockStyle.Fill,
            AutoEllipsis = true,
            TextAlign = alignment,
            ForeColor = color,
            Font = new Font("Malgun Gothic", 9F, style),
            Margin = Padding.Empty
        };

    private static void ConfigureTextBox(TextBox box, string placeholder, bool multiline = false)
    {
        box.PlaceholderText = placeholder;
        box.BorderStyle = BorderStyle.None;
        box.BackColor = SurfaceColor;
        box.Dock = DockStyle.Fill;
        box.Margin = Padding.Empty;
        box.Multiline = multiline;
        if (multiline)
        {
            box.ScrollBars = ScrollBars.Vertical;
        }
    }

    private static RoundedPanel CreateInputHost(TextBox box) => new()
    {
        Dock = DockStyle.Fill,
        Margin = new Padding(3),
        Padding = new Padding(9, 7, 9, 5),
        BackColor = SurfaceColor,
        BorderColor = Color.FromArgb(205, 216, 223),
        Radius = 9,
        Controls = { box }
    };

    private void ConfigureIconButton(RoundedButton button, string icon, string name, Color color)
    {
        button.Text = icon;
        button.AccessibleName = name;
        button.Size = new Size(48, 38);
        button.Margin = new Padding(5, 3, 5, 3);
        button.Font = new Font("Segoe UI Symbol", 12F, FontStyle.Bold);
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderSize = 0;
        button.ForeColor = Color.White;
        button.BackColor = color;
        button.Radius = 10;
        _toolTip.SetToolTip(button, name);
    }

    private static Control Centered(Control content)
    {
        var host = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            ColumnCount = 3,
            RowCount = 1,
            BackColor = Color.Transparent,
            Margin = Padding.Empty
        };
        host.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        host.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        host.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        host.Controls.Add(content, 1, 0);
        return host;
    }
}

internal sealed class HistoryEditForm : Form
{
    private readonly TextBox _task = new();
    private readonly TextBox _dev = new();
    private readonly TextBox _job = new();
    private readonly TextBox _time = new();
    private readonly TextBox _memo = new();
    private readonly CheckBox _completed = new();
    private readonly HistoryEntry _source;

    public HistoryEditForm(HistoryEntry source)
    {
        _source = source;
        Text = "내역 편집";
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(400, 326);
        MinimumSize = new Size(360, 310);
        BackColor = Color.FromArgb(244, 247, 249);
        Font = new Font("Malgun Gothic", 9F);

        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(14),
            ColumnCount = 2,
            RowCount = 7,
            BackColor = BackColor
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 72));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        AddRow(layout, 0, "작업번호", _task);
        AddRow(layout, 1, "개발번호", _dev);
        AddRow(layout, 2, "잡명", _job);
        AddRow(layout, 3, "시간", _time);
        _memo.Multiline = true;
        _memo.AcceptsReturn = true;
        _memo.ScrollBars = ScrollBars.Vertical;
        _memo.KeyDown += (_, e) =>
        {
            if (e.KeyCode == Keys.Enter && e.Shift)
            {
                e.SuppressKeyPress = true;
                e.Handled = true;
                ValidateAndClose();
            }
        };
        AddRow(layout, 4, "메모", _memo);
        _completed.Text = "완료";
        _completed.AutoSize = true;
        _completed.Anchor = AnchorStyles.Left;
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.Controls.Add(_completed, 1, 5);

        var save = CreateDialogButton("저장", Color.FromArgb(47, 145, 119));
        var cancel = CreateDialogButton("취소", Color.FromArgb(111, 121, 130));
        save.DialogResult = DialogResult.None;
        cancel.DialogResult = DialogResult.Cancel;
        save.Click += (_, _) => ValidateAndClose();
        var buttons = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 2,
            RowCount = 1,
            Margin = new Padding(0, 8, 0, 0)
        };
        buttons.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        buttons.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        buttons.Controls.Add(save, 0, 0);
        buttons.Controls.Add(cancel, 1, 0);
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));
        layout.SetColumnSpan(buttons, 2);
        layout.Controls.Add(buttons, 0, 6);
        Controls.Add(layout);
        AcceptButton = save;
        CancelButton = cancel;

        _task.Text = source.TaskNumber;
        _dev.Text = source.DevNumber;
        _job.Text = source.JobName;
        _time.Text = TsvExporter.FormatElapsed(source.ElapsedMilliseconds);
        _memo.Text = source.Memo;
        _completed.Checked = source.Completed;
        Result = source.Clone();
    }

    public HistoryEntry Result { get; private set; }

    private void ValidateAndClose()
    {
        if (!TsvExporter.TryParseElapsed(_time.Text, out var milliseconds))
        {
            MessageBox.Show(this, "시간은 H:MM 또는 H:MM:SS 형식으로 입력해 주세요.", "Timer",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            _time.Focus();
            return;
        }

        Result = _source.Clone();
        Result.TaskNumber = _task.Text;
        Result.DevNumber = _dev.Text;
        Result.JobName = _job.Text;
        Result.ElapsedMilliseconds = milliseconds;
        Result.Memo = _memo.Text;
        Result.Completed = _completed.Checked;
        DialogResult = DialogResult.OK;
        Close();
    }

    private static void AddRow(TableLayoutPanel layout, int row, string label, TextBox control)
    {
        layout.RowStyles.Add(new RowStyle(row == 4 ? SizeType.Percent : SizeType.Absolute,
            row == 4 ? 100 : 36));
        var caption = new Label
        {
            Text = label,
            AutoSize = true,
            Anchor = AnchorStyles.Left,
            ForeColor = Color.FromArgb(48, 69, 84),
            Margin = new Padding(3, 7, 3, 3)
        };
        control.BorderStyle = BorderStyle.None;
        control.BackColor = Color.White;
        control.Dock = DockStyle.Fill;
        control.Margin = Padding.Empty;
        var host = new RoundedPanel
        {
            Dock = DockStyle.Fill,
            Margin = new Padding(3),
            Padding = new Padding(9, 7, 9, 5),
            BackColor = Color.White,
            BorderColor = Color.FromArgb(205, 216, 223),
            Radius = 9
        };
        host.Controls.Add(control);
        layout.Controls.Add(caption, 0, row);
        layout.Controls.Add(host, 1, row);
    }

    private static RoundedButton CreateDialogButton(string text, Color color) => new()
    {
        Text = text,
        Dock = DockStyle.Fill,
        Margin = new Padding(4),
        BackColor = color,
        ForeColor = Color.White,
        FlatStyle = FlatStyle.Flat,
        Radius = 9
    };
}

internal class RoundedPanel : Panel
{
    private Color _borderColor = Color.Transparent;
    private int _radius = 12;

    public RoundedPanel()
    {
        SetStyle(ControlStyles.UserPaint |
                 ControlStyles.AllPaintingInWmPaint |
                 ControlStyles.OptimizedDoubleBuffer |
                 ControlStyles.StandardDoubleClick, true);
    }

    public int Radius
    {
        get => _radius;
        set
        {
            _radius = value;
            UpdateRoundedRegion();
            Invalidate();
        }
    }

    public Color BorderColor
    {
        get => _borderColor;
        set
        {
            _borderColor = value;
            Invalidate();
        }
    }

    protected override void OnSizeChanged(EventArgs e)
    {
        base.OnSizeChanged(e);
        UpdateRoundedRegion();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        if (BorderColor == Color.Transparent || Width < 2 || Height < 2)
        {
            return;
        }
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        using var path = UiStyle.CreateRoundedPath(new Rectangle(0, 0, Width - 1, Height - 1), Radius);
        using var pen = new Pen(BorderColor);
        e.Graphics.DrawPath(pen, path);
    }

    private void UpdateRoundedRegion() => UiStyle.ApplyRoundedRegion(this, Radius);
}

internal sealed class RoundedButton : Button
{
    private int _radius = 10;
    private bool _hovered;
    private bool _pressed;

    public RoundedButton()
    {
        SetStyle(ControlStyles.UserPaint |
                 ControlStyles.AllPaintingInWmPaint |
                 ControlStyles.OptimizedDoubleBuffer |
                 ControlStyles.ResizeRedraw, true);
    }

    public int Radius
    {
        get => _radius;
        set
        {
            _radius = value;
            Invalidate();
        }
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.Clear(UiStyle.ResolveBackColor(this));
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;

        var bounds = new Rectangle(0, _pressed ? 1 : 0, Width - 1, Height - 1);
        using var path = UiStyle.CreateRoundedPath(bounds, Radius);
        using var brush = new SolidBrush(ButtonColor());
        e.Graphics.FillPath(brush, path);

        var textColor = Enabled ? ForeColor : Color.FromArgb(238, 242, 245);
        TextRenderer.DrawText(
            e.Graphics,
            Text,
            Font,
            new Rectangle(0, _pressed ? 1 : 0, Width, Height),
            textColor,
            TextFormatFlags.HorizontalCenter |
            TextFormatFlags.VerticalCenter |
            TextFormatFlags.NoPadding);
    }

    private Color ButtonColor()
    {
        if (!Enabled)
        {
            return UiStyle.Blend(BackColor, UiStyle.ResolveBackColor(this), 0.32f);
        }
        if (_pressed)
        {
            return UiStyle.Blend(BackColor, Color.Black, 0.12f);
        }
        return _hovered ? UiStyle.Blend(BackColor, Color.White, 0.16f) : BackColor;
    }

    protected override void OnEnabledChanged(EventArgs e)
    {
        base.OnEnabledChanged(e);
        Invalidate();
    }

    protected override void OnMouseEnter(EventArgs e) { base.OnMouseEnter(e); _hovered = true; Invalidate(); }
    protected override void OnMouseLeave(EventArgs e) { base.OnMouseLeave(e); _hovered = false; _pressed = false; Invalidate(); }
    protected override void OnMouseDown(MouseEventArgs mevent) { base.OnMouseDown(mevent); _pressed = true; Invalidate(); }
    protected override void OnMouseUp(MouseEventArgs mevent) { base.OnMouseUp(mevent); _pressed = false; Invalidate(); }
}

internal static class UiStyle
{
    public static Color ResolveBackColor(Control control)
    {
        for (var current = control.Parent; current is not null; current = current.Parent)
        {
            if (current.BackColor != Color.Transparent)
            {
                return current.BackColor;
            }
        }
        return SystemColors.Control;
    }

    public static Color Blend(Color source, Color target, float amount)
    {
        var keep = 1f - amount;
        return Color.FromArgb(
            source.A,
            (int)(source.R * keep + target.R * amount),
            (int)(source.G * keep + target.G * amount),
            (int)(source.B * keep + target.B * amount));
    }

    public static void ApplyRoundedRegion(Control control, int radius)
    {
        if (control.Width <= 0 || control.Height <= 0)
        {
            return;
        }
        using var path = CreateRoundedPath(new Rectangle(0, 0, control.Width, control.Height), radius);
        var previous = control.Region;
        control.Region = new Region(path);
        previous?.Dispose();
    }

    public static GraphicsPath CreateRoundedPath(Rectangle bounds, int radius)
    {
        var path = new GraphicsPath();
        var diameter = Math.Min(radius * 2, Math.Min(bounds.Width, bounds.Height));
        if (diameter <= 1)
        {
            path.AddRectangle(bounds);
            path.CloseFigure();
            return path;
        }

        var arc = new Rectangle(bounds.Location, new Size(diameter, diameter));
        path.AddArc(arc, 180, 90);
        arc.X = bounds.Right - diameter;
        path.AddArc(arc, 270, 90);
        arc.Y = bounds.Bottom - diameter;
        path.AddArc(arc, 0, 90);
        arc.X = bounds.Left;
        path.AddArc(arc, 90, 90);
        path.CloseFigure();
        return path;
    }
}
