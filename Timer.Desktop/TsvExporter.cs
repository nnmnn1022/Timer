using System.Globalization;

namespace TimerDesktop;

internal static class TsvExporter
{
    public static string CreateStandard(IEnumerable<HistoryEntry> history, DateOnly localDate)
    {
        return string.Join(Environment.NewLine, EntriesForDate(history, localDate).Select(entry =>
        {
            var date = entry.CreatedAtUtc.LocalDateTime.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            var yearMonth = entry.CreatedAtUtc.LocalDateTime.ToString("yyyy-MM", CultureInfo.InvariantCulture);
            var cells = new string[18];
            cells[0] = date;
            cells[1] = entry.TaskNumber;
            cells[2] = entry.DevNumber;
            cells[3] = entry.JobName;
            cells[13] = entry.Memo;
            cells[17] = yearMonth;
            return string.Join('\t', cells.Select(Sanitize));
        }));
    }

    public static string CreateCompact(IEnumerable<HistoryEntry> history, DateOnly localDate)
    {
        return string.Join(Environment.NewLine, EntriesForDate(history, localDate).Select(entry =>
            string.Join('\t',
                Sanitize(entry.TaskNumber),
                Sanitize(entry.DevNumber),
                Sanitize(entry.JobName),
                Math.Max(0, entry.ElapsedMilliseconds / 1000 / 60).ToString(CultureInfo.InvariantCulture),
                Sanitize(entry.Memo))));
    }

    public static bool TryParseElapsed(string text, out long milliseconds)
    {
        milliseconds = 0;
        var parts = text.Trim().Split(':');
        if (parts.Length is not (2 or 3) ||
            !long.TryParse(parts[0], out var hours) ||
            !int.TryParse(parts[1], out var minutes) ||
            (parts.Length == 3 && !int.TryParse(parts[2], out _)))
        {
            return false;
        }

        var seconds = 0;
        if (parts.Length == 3)
        {
            _ = int.TryParse(parts[2], out seconds);
        }

        if (hours < 0 || minutes is < 0 or > 59 || seconds is < 0 or > 59)
        {
            return false;
        }

        try
        {
            milliseconds = checked(((hours * 60 * 60) + (minutes * 60L) + seconds) * 1000);
            return true;
        }
        catch (OverflowException)
        {
            return false;
        }
    }

    public static string FormatElapsed(long milliseconds, bool minuteDisplay = false)
    {
        var nonNegativeMilliseconds = Math.Max(0, milliseconds);
        if (minuteDisplay)
        {
            var totalMinutes = nonNegativeMilliseconds / 60_000;
            if (nonNegativeMilliseconds % 60_000 >= 30_000)
            {
                totalMinutes++;
            }
            return $"{totalMinutes}분";
        }

        var totalSeconds = nonNegativeMilliseconds / 1000;
        var hours = totalSeconds / 3600;
        var minutes = totalSeconds % 3600 / 60;
        var seconds = totalSeconds % 60;
        return $"{hours}:{minutes:00}:{seconds:00}";
    }

    private static IEnumerable<HistoryEntry> EntriesForDate(
        IEnumerable<HistoryEntry> history,
        DateOnly localDate) =>
        history
            .Where(x => DateOnly.FromDateTime(x.CreatedAtUtc.LocalDateTime) == localDate)
            .OrderBy(x => x.CreatedAtUtc);

    private static string Sanitize(string? value) =>
        (value ?? "").Replace('\t', ' ').Replace('\r', ' ').Replace('\n', ' ');
}
