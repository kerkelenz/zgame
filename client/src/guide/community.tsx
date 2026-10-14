import type { Topic } from './types';

/** Together and on your own: territory, people, standing and your account */
export const COMMUNITY: Topic[] = [
  {
    id: 'territory', title: 'Territory: holding systems',
    body: (
      <ul>
        <li>An alliance can <b>hold a system</b>. Every planet owned by an alliance member counts toward its <b>influence</b> in that system: a base of 100 for each planet plus the points of everything built, stationed and defending on it (moons count what is on them). Commanders without an alliance and computer empires do not count.</li>
        <li><b>Claiming:</b> an alliance needs at least 300 influence in the system and a lead of 25% over the next alliance there. <b>Keeping:</b> the holder keeps it until its influence drops below 150 or a rival has 25% more than the holder (and at least 300). Control is recalculated every minute, and both sides are told when a system changes hands.</li>
        <li>So territory is won and lost on the ground: build up your planets, station fleets and defenses on them, or break an enemy's defenses and fleets (and colonize next to them) to tip a contested system. A ⚔ on the map marks a system where two alliances are present.</li>
        <li><b>Reward:</b> every system the alliance holds adds +0.5% mine output for <i>every</i> member, wherever they live, up to +10% (20 systems). It shows up in the Alliance and Economy figures. Alliances are also ranked by systems held on the Standing page.</li>
        <li>The <b>Territory</b> page maps every system: solid colour is held (your alliance has a gold outline), a dashed outline means presence but no holder yet. Hover a system for each alliance's influence and click it to open it in the Galaxy, which also shows the sector's holder and influence at the top.</li>
      </ul>
    ),
  },
  {
    id: 'people', title: 'People: profiles, contacts and messages',
    body: (
      <ul>
        <li>Click a commander's name anywhere (Standing, the Galaxy, Contacts, your alliance) for their <b>profile</b>: rank in every category, record, class, alliance, achievements and <b>where all their planets are</b>, under the banner of their home world. Resources, fleets and queues are always private. Back returns to the page you came from.</li>
        <li><b>Contacts</b> holds your <b>buddies</b> (with online status and home coordinates), <b>blocked</b> commanders (they cannot message you and their chat lines are hidden), <b>bookmarks</b>, private <b>notes</b> and your <b>spy report archive</b>. Add a buddy, block or report someone from their profile; reports go to the admins.</li>
        <li><b>Messages</b> collects battle, spy, expedition, alliance and system reports; you can message other commanders directly. <b>Chat</b> has a global and an alliance channel. Muted commanders cannot send either.</li>
        <li>Be decent: spam and abuse get people muted or banned.</li>
      </ul>
    ),
  },
  {
    id: 'standing', title: 'Standing and seasons',
    body: (
      <ul>
        <li><b>Points</b> come from what you have invested: 1 point per 1,000 resources spent on buildings, research, ships and defenses. <b>Standing</b> ranks everyone by total points and by economy, research, fleet, defense, battles won, resources destroyed, plundered, recycled, expeditions, raids repelled and moons destroyed. Alliances are ranked by the sum of their members. The rankings refresh every fifteen seconds or so. Once every 24 hours the standing is written down, and the <b>24 h</b> and <b>Place</b> columns show how many points each commander has gained or lost since then and how many places they climbed (▲) or fell (▼); someone who joined after the snapshot shows <i>new</i>. Charts show your points and rank over time.</li>
        <li>Some universes run in <b>seasons</b>. Standing shows the time left and any victory score. When a season ends the champion earns Command Credits and an achievement, the top players enter the <b>hall of fame</b>, and after a short grace period the universe resets: everyone starts on a fresh homeworld. You keep your account, credits, officers, class, achievements, alliance and contacts.</li>
      </ul>
    ),
  },
  {
    id: 'account', title: 'Your account, alerts and vacation',
    body: (
      <ul>
        <li><b>Settings</b> hold your account: change password, rename (once every 7 days; your homeworld is renamed too) and delete. Make a <b>recovery key</b> - there is no email reset, and a key is the only way back in if you forget your password. Logins expire after 30 days without use, and <b>Log out</b> signs that device out.</li>
        <li><b>Message options.</b> In Settings, <b>No messages when something finishes</b> stops the in-game message when a building, research or production run completes (alerts outside the game are separate). <b>News about other commanders' battles</b> is off by default: you hear about raids on members of your own alliance, and only if you switch it on also about computer empires raiding people you do not know.</li>
        <li><b>Alerts outside the game.</b> Add a Discord webhook or an ntfy topic (a free phone app) and choose what to be told about: attacks, raids and missiles aimed at you, allies under attack, tribute demands, finished construction, research, ships and objectives, private messages, and <b>queues running dry</b>: a building queue or the research that has been empty for half an hour sends one alert (it counts from the moment the last job finished, and starting anything resets it). You can limit alerts to when you are away. Browser notifications, sound cues, the tab title (unread messages and incoming fleets) and a language choice are in Settings too.</li>
        <li><b>Install the app and push notifications.</b> Settings offers <b>Install the app</b> (or your browser's Install / Add to Home Screen) so the game opens like an app, and <b>Turn on for this device</b> to get a notification on that phone or computer when you are attacked, an ally needs help, tribute is demanded or something finishes - even with the game closed. Each device is turned on separately; the same alert categories and the "only when I am away" switch apply as for Discord and ntfy. On an iPhone or iPad the game must first be added to the Home Screen (Share, then Add to Home Screen). Push needs a secure (https) connection.</li>
        <li><b>Vacation mode</b> freezes your empire and makes you untouchable while you are away: nothing is produced, built or researched and nobody can attack or spy on you. To start, your empire must be quiet (no fleets in flight, no queues, no hostile fleets heading for you, no allied fleets stationed with you). It lasts at least 48 hours and you cannot do anything until you end it.</li>
        <li>The <b>welcome tour</b> can be replayed from Settings.</li>
      </ul>
    ),
  },
];

/** only shown to admins */
export const ADMIN: Topic = {
  id: 'admin', title: 'Admin tools',
  body: (
    <ul>
      <li><b>Server health</b> at the top of the Admin page, refreshed every five seconds: how long the server has been up, how long a tick takes (average, 95% under, slowest; it turns red when ticks are slow), the last save with its time and size, memory, how many commanders are online now, today and this week and how many live connections there are, the size of the world, and the last twenty errors.</li>
      <li>The <b>Admin</b> page lists every commander. <b>Ban</b> and <b>Mute</b> take an optional number of hours (blank is permanent) and a reason the player sees. <b>Raid</b> sends a computer-empire raid, <b>Inspect</b> shows a commander's full state (without password data), <b>Remove</b> deletes them, and you can <b>gift resources</b> to a homeworld.</li>
      <li><b>Announcement</b> messages every commander and pops a notice for anyone online. <b>Player reports</b> sent from profiles queue up until you resolve them.</li>
      <li><b>Scheduled announcements</b> go out later: write the message, say in how many minutes it is sent and, if you like, every how many hours it repeats (0 sends it once). They are listed with their next time and can be cancelled; a repeating one that was missed while the server was off is sent once, not for every missed turn.</li>
      <li><b>Moderation</b> lists everyone who is banned or muted with the reason and the end time, with a button to lift each. <b>Commanders per day</b> shows, for the last two weeks (UTC days), how many accounts were created, how many commanders were seen and how many of those had joined on an earlier day. The <b>Audit log</b> records every admin action (bans, mutes, announcements, gifts, raids, invasions, seasons, removals) with who did it, to whom and when; it keeps the latest 500.</li>
      <li><b>Event</b> in the Commanders list sends that commander a random encounter at once (the audit log records it). Their timing is set by ZGAME_ENCOUNTER_MIN_MINUTES and ZGAME_ENCOUNTER_MAX_MINUTES (0 turns events off).</li>
      <li><b>Void invasion:</b> start one by hand (you choose how many minutes until the rift opens) or end the current one early; waves otherwise come on their own schedule.</li>
      <li><b>Season:</b> end the current season (crowns the champion and fills the hall of fame), then reset the universe. Admins cannot be banned, muted or removed from this page.</li>
    </ul>
  ),
};
