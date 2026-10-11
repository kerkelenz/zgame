import { Card, Page } from '../ui';

export function Guide() {
  return (
    <Page title="Guide">
      <Card title="Getting started">
        <ol>
          <li>Build <b>Metal Mine</b>, <b>Crystal Mine</b> and a <b>Solar Plant</b> first. Mines need energy - if the energy balance (top bar) goes negative, production drops.</li>
          <li>Add a <b>Deuterium Synthesizer</b>, storages when a resource bar is full, and a <b>Robotics Factory</b> to speed up construction.</li>
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
          <li>Use <b>Chat</b> (global and alliance) to coordinate.</li>
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
      <Card title="Fleet tips">
        <ul>
          <li>Flights cost deuterium. Slower speed % uses less fuel. Recall at any time - the fleet returns after the time already travelled.</li>
          <li><b>Espionage</b> probes reveal resources, fleet, defenses, buildings and research depending on probe count and tech difference. Check before attacking.</li>
          <li>Destroyed ships leave a <b>debris field</b>; Recyclers collect it. Defenses rebuild ~70% of the time after a battle.</li>
          <li>Players with low points are under <b>newbie protection</b> and can neither attack nor be attacked.</li>
          <li>Battles last up to 6 rounds. Rapid fire lets some ships shoot repeatedly at certain targets - check the unit cards.</li>
        </ul>
      </Card>
    </Page>
  );
}
