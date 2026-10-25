"""Gamification, platform capabilities and narrative archetypes (pure logic, no I/O).

Design rule: XP rewards intentional decisions and honest feedback, never blanket
blocking. Anti-abuse checks live in `xp_for`.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

WORLD = [
    (0, "Bedroom desk", "Where every twin starts. One lamp, one dream."),
    (100, "Garage lab", "Whiteboard unlocked. Ideas start sticking."),
    (250, "Rooftop studio", "You can see the city. The city can't see your notifications."),
    (450, "Hangar", "A small plane appears. It needs focus-fuel."),
    (700, "Private jet", "You fly over the Arabian Sea. Universe B is real."),
    (1000, "Orbital station", "Notifications can't reach you up here. Unless they matter."),
]


def world_state(xp: int):
    unlocked = [dict(name=n, desc=d, at=at, unlocked=xp >= at) for at, n, d in WORLD]
    current = max((w for w in unlocked if w["unlocked"]), key=lambda w: w["at"])
    nxt = next((w for w in unlocked if not w["unlocked"]), None)
    return dict(current=current, next=nxt, places=unlocked)


def universe_names(cost_allow: float, cost_delay: float):
    """Fictional archetypes for the two futures. Chosen by rules from the model's numbers."""
    if cost_allow >= 20:
        a = ("The Scrollfather", "An offer you can't refuse: one more reel.")
    elif cost_allow >= 8:
        a = ("Chaos Goblin", "Six tabs, two apps, zero memory of why you came.")
    elif cost_allow >= 3:
        a = ("Quick Peeker", "In and out. Mostly.")
    else:
        a = ("Unbothered", "This ping barely touches you.")
    b = ("Focus Legend", "Momentum kept, mission protected.") if cost_allow - cost_delay > 5 else ("Main Character", "You chose, on purpose. That's the whole point.")
    return dict(a=dict(name=a[0], line=a[1]), b=dict(name=b[0], line=b[1]))


def xp_for(choice: str, importance: float, saved: float, honest: bool, recent_same: int, today_delay_xp: int):
    """Returns (xp, reasons). Guards against farming: no XP for holding back urgent things,
    diminishing returns for repeat decisions, and a daily cap on hold-back XP."""
    reasons = []
    xp = 5
    reasons.append("+5 intentional decision")
    if honest:
        xp += 15
        reasons.append("+15 told your twin what really happened")
    if choice != "allow":
        if importance >= 0.75:
            reasons.append("+0 holding back something important earns nothing")
        elif saved > 2 and today_delay_xp < 60:
            xp += 10
            reasons.append("+10 protected focus")
        elif today_delay_xp >= 60:
            reasons.append("+0 daily hold-back cap reached (balance matters)")
    if recent_same >= 3:
        xp = max(1, xp // 3)
        reasons.append("÷3 same decision repeated quickly")
    return xp, reasons


def streak(days_with_intent: set[str], today: date | None = None):
    """Focus streak with forgiveness: one missed day per 7 is 'frozen', not a reset."""
    today = today or date.today()
    d = today if today.isoformat() in days_with_intent else today - timedelta(days=1)
    count, freezes, misses = 0, 1, 0
    while True:
        if d.isoformat() in days_with_intent:
            count += 1
        elif freezes > 0 and count > 0:
            freezes -= 1
            misses += 1
        else:
            break
        if count and count % 7 == 0:
            freezes = 1
        d -= timedelta(days=1)
        if count > 365:
            break
    return dict(current=count, frozen_days=misses, rule="One missed day per week is forgiven. Rest is part of focus.")


CAPABILITIES = {
    "android": dict(label="Android", read_notifications=True, suppress_notifications=True, app_usage=True,
                    how="NotificationListenerService (user-granted) + UsageStatsManager",
                    limits="Requires special access in Settings; Play Store policy review for listener apps."),
    "ios": dict(label="iOS", read_notifications=False, suppress_notifications="partial", app_usage="aggregate",
                how="Screen Time API (FamilyControls, DeviceActivity, ManagedSettings) + Focus filters",
                limits="Third-party apps cannot read other apps' notifications; only opaque app tokens and thresholds."),
    "macos": dict(label="macOS", read_notifications=False, suppress_notifications=False, app_usage=True,
                  how="ActivityWatch (aw-watcher-window, aw-watcher-afk) via localhost REST",
                  limits="No public API for other apps' notifications; interruptions inferred from app switches."),
    "windows": dict(label="Windows", read_notifications="partial", suppress_notifications=False, app_usage=True,
                    how="ActivityWatch + UserNotificationListener (with permission)",
                    limits="Notification access requires user consent and packaged app identity."),
    "web": dict(label="Browser demo", read_notifications=False, suppress_notifications=False, app_usage="tab-only",
                how="Page Visibility API + synthetic demo history",
                limits="A web page only sees itself. The demo twin is trained on consented synthetic data."),
}


def checkpoint_after(now: datetime, minutes: int = 25) -> datetime:
    """Next natural checkpoint: end of a 25-minute block, rounded up to 5 minutes."""
    t = now + timedelta(minutes=minutes)
    return t.replace(second=0, microsecond=0) + timedelta(minutes=(5 - t.minute % 5) % 5)
