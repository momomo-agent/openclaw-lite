# Heartbeat Checklist

When this heartbeat fires, do the following:

1. **Review memory** — call `memory_search` with a broad query to recall recent context, pending items, or unfinished work.
2. **Check tasks** — call `task_list` to see if any tasks are pending or blocked. If something is unblocked, consider progressing it.
3. **Light check-in** — if anything needs the user's attention, set status to `need_you` with a brief description. Otherwise, reply `HEARTBEAT_OK`.

Keep it brief. Only notify the user if there's something actionable.
