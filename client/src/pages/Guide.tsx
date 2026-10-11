import { CHANGELOG, markChangelogSeen } from '../changelog';
import { Card, Page } from '../ui';
import { useEffect } from 'react';

export function Guide() {
  useEffect(() => { markChangelogSeen(); }, []);
  return (
    <Page title="Guide">
      <Card title="What's new">
        {CHANGELOG.map((r) => (
          <div key={r.id}>
            <h4>{r.title} <span className="muted small">{r.date}</span></h4>
            <ul className="notes">{r.items.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        ))}
      </Card>
      <Card title="Getting started">
        <ol>
          <li>Build <b>Metal Mine</b>, <b>Crystal Mine</b> and a <b>Solar Plant</b> first. Mines need energy - if the energy balance (top bar) goes negative, production drops.</li>
          <li>Add a <b>Vespene Extractor</b>, storages when a resource bar is full, and a <b>Robotics Factory</b> to speed up construction.</li>
          <li>Build a <b>Research Lab</b>, then research Energy, Combustion Drive and Computer. A <b>Shipyard</b> (needs Robotics 2) unlocks ships and defenses.</li>
          <li>Colonize more planets with colony ships (more planets need <b>Astrophysics</b>). Expeditions also need it.</li>
        </ol>
      </Card>
      <Card title="Playing together">
        <ul>
          <li>Found or join an <b>Alliance</b>. Donate to the shared bank; officers buy upgrades that boost every member (mine output, research time, fleet speed).</li>
          <li><b>Raiders</b> (NPCs) periodically attack players. You get at least 10 minutes warning, and allies are warned too.</li>
          <li>Send a <b>Defend ally (hold)</b> fleet to an ally's planet - your ships fight next to theirs. When raiders are crushed, everyone who defended shares a bounty.</li>
          <li>Attack another player together: dispatch an <b>Attack</b>, then allies pick <i>Joint attack</i> in the Fleet page to arrive at the same moment. Loot is split by cargo space.</li>
          <li>Use <b>Chat</b> (global and alliance) to coordinate. The alliance <b>bulletin board</b> holds standing orders, and a leader can message every member at once.</li>
          <li>The <b>Joint Command</b> alliance upgrade gives every member +1 fleet slot per two levels.</li>
          <li>Founders can create <b>ranks</b> that grant individual permissions (applications, kicking, bank grants, upgrades, description, messages, bulletin, diplomacy).</li>
          <li><b>Diplomacy:</b> a <i>pact</i> (both alliances must agree) stops either side attacking the other. A <i>war</i> is declared by one side and flags the enemy in the Galaxy. Either side can end a treaty.</li>
        </ul>
      </Card>
      <Card title="Understanding your economy">
        <ul>
          <li>Click <b>any item name</b> (in Buildings, Research, Shipyard, or in a requirement list) for its <b>details page</b>: what each level gives you, what it costs, and what it unlocks.</li>
          <li>The <b>Economy</b> page shows where your income comes from, when stores fill, and ranks upgrades by how fast they pay for themselves.</li>
          <li>Watch the energy efficiency: past a point extra mine levels give less, because the planet cannot power them. The mine details pages show this level by level.</li>
        </ul>
      </Card>
      <Card title="Empires, factions and Command">
        <ul>
          <li><b>Computer empires</b> fill the galaxy. <i>Inactive</i> ones never spend - spy on them and take their stockpile. <i>Aggressive</i> ones raid you; a grudge from your own raids can turn any empire hostile.</li>
          <li>A strong hostile empire may <b>demand tribute</b>. Paying buys a truce; refusing (or ignoring it) brings their fleet. Answer in <b>Command</b>.</li>
          <li>Raiding a <b>faction's</b> empires costs standing with it and earns half as much with its rival. At 40 standing you can join: members stop raiding you and you get the faction's perk.</li>
          <li>Follow the <b>objectives</b> on the Overview for your first hours. Objectives, achievements and expeditions pay <b>Command Credits</b>, which buy permanent officers.</li>
          <li>The <b>Battle Simulator</b> predicts a fight before you fly it - load a defender straight from a spy report.</li>
        </ul>
      </Card>
      <Card title="Queues and the merchant">
        <ul>
          <li>Buildings and research can queue four deep behind the running job. Each entry is <b>paid and reserved when you queue it</b> and refunded if you remove it; use the arrows to reorder.</li>
          <li>The <b>travelling merchant</b> swaps resources at 3 : 2 : 1 with a 12% cut (8% for Collectors). Each day he does one pair at only 2% up to a daily allowance - the Resources page shows today's deal.</li>
          <li>The <b>Supply depot</b> in Command spends Command Credits on production crates and on halving the time left on your current build or research.</li>
          <li><b>Gather</b> (Resources page) sends loaded cargo ships from all your other planets to the one you are viewing.</li>
          <li>Orbit matters: positions 1-3 give extra crystal, 6-10 extra metal (up to +35% at position 8). <b>Crawlers</b> (planet-only, fragile) add +0.1% to every mine each, up to +50%.</li>
        </ul>
      </Card>
      <Card title="Moons, wreck fields and the Space Dock">
        <ul>
          <li>A big enough debris field can condense into a <b>moon</b> (Lunar Base, Sensor Phalanx, Jump Gate). Send Deathstars on a <b>Destroy moon</b> mission to try to destroy one: the odds improve with more Deathstars and smaller moons, but the shock wave can destroy your Deathstars.</li>
          <li>When a battle destroys enough of a defender's ships a <b>wreck field</b> forms. A <b>Space Dock</b> rebuilds a share of it for free (30% + 6% per level, up to 90%) before it drifts away after 72 hours. See the Overview.</li>
        </ul>
      </Card>
      <Card title="Expeditions">
        <ul>
          <li>Deep space (the last slot of a system) needs Astrophysics. You choose how long to stay out, <b>1-4 hours</b>: each extra hour finds about 30% more but widens the black-hole risk.</li>
          <li><b>Pathfinders</b> (a ship) add 10% to finds each (up to five) and have a 20% chance each to steer the fleet clear of a black hole.</li>
          <li><b>Recyclers</b> add 25% to resource finds and can salvage wreckage; <b>probes</b> scout, making pirate fleets 25% smaller. Ancient data caches can speed up your running research. Discoverers get extra slots and find more.</li>
        </ul>
      </Card>
      <Card title="Classes, vacation and alerts">
        <ul>
          <li>Pick a <b>class</b> in Command: Collector (mines, energy, cargo, merchant, crawlers), General (fleet slots, fuel, speed, debris) or Discoverer (expeditions, research, colonies). The first choice is free.</li>
          <li><b>Vacation mode</b> (Settings) freezes your empire and protects it, but needs a quiet empire and lasts at least 48 hours.</li>
          <li>Get <b>alerts outside the game</b> through a Discord webhook or the ntfy phone app (Settings), plus optional sound cues and browser notifications. The tab title shows unread messages and hostile fleets.</li>
        </ul>
      </Card>
      <Card title="People, standing and seasons">
        <ul>
          <li>Click any commander's name for their <b>profile</b>: rank in every category, record, class, alliance and achievements. <b>Standing</b> switches between total, economy, research, fleet, defense and activity rankings.</li>
          <li><b>Contacts</b> keeps buddies, blocked commanders, private notes, bookmarks and your latest <b>spy report</b> for each planet. Use Report on a profile if someone breaks the rules.</li>
          <li>Battle reports have a round-by-round table; <b>Share link</b> makes a public page you can paste into chat.</li>
          <li>Some universes run in <b>seasons</b>: at the end the top players enter the hall of fame and the universe resets. You keep your account, credits, officers, class and achievements.</li>
          <li>Account settings (password, rename, recovery key, delete) are in Settings. Keep a <b>recovery key</b> - there is no email reset.</li>
        </ul>
      </Card>
      <Card title="Fleet tips">
        <ul>
          <li>Flights cost vespene gas. Slower speed % uses less fuel. Recall at any time - the fleet returns after the time already travelled.</li>
          <li><b>Espionage</b> probes reveal resources, fleet, defenses, buildings and research depending on probe count and tech difference. Check before attacking.</li>
          <li>Destroyed ships leave a <b>debris field</b>; Recyclers collect it. Defenses rebuild ~70% of the time after a battle.</li>
          <li>Players with low points are under <b>newbie protection</b> and can neither attack nor be attacked. The Galaxy flags them: <b>n</b> too weak, <b>s</b> too strong, <b>v</b> vacation, <b>i / I</b> inactive 7 / 28 days, ● online.</li>
          <li>An incoming attack shows who sends it and <b>where it launched from</b> (planet and coordinates) in Fleet, the alert bar and your messages.</li>
          <li>Battles last up to 6 rounds. Rapid fire lets some ships shoot repeatedly at certain targets - check the unit cards.</li>
        </ul>
      </Card>
    </Page>
  );
}
