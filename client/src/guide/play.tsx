import type { Topic } from './types';

/** Playing: ships, planets, fleets, battles, the galaxy and expeditions */
export const PLAY: Topic[] = [
  {
    id: 'ships', title: 'Ships, defenses and missiles',
    body: (
      <ul>
        <li><b>Planner.</b> At the top of the Shipyard and Defense pages, pick a unit and a number: the planner shows the price, the buildings and research still missing (each with the price of the levels you lack, in the order to do them), the total, the building time at this Shipyard, and whether you can pay now or when at this planet's production. <b>Queue the missing steps</b> queues as many of those as the queues allow; <b>Build</b> queues the units once nothing is missing and you can pay.</li>
        <li><b>Defense advisor.</b> On the Defense page, <b>Check</b> fights the smallest and the largest raid this game can send at the selected planet, in the battle simulator, and says for each whether the planet holds, could go either way or falls, with the ships in the raid and the share of your defending value you would lose. If the large raid would not fail it names the cheapest defense and the number needed to make it fail, with a button to queue them. It is an estimate: real raids are randomised and an empire's techs may differ from yours.</li>
        <li>The <b>Shipyard</b> builds ships; the <b>Defense</b> page builds planetary defenses. Both need a Shipyard building and the right technology, run as queues, and can be cancelled for a refund of unbuilt units. Shield domes are limited to one of each per planet.</li>
        <li>Every unit card shows attack, shield, hull, cargo, speed and <b>rapid fire</b>: some ships get extra shots against certain targets, which is why mixed fleets beat a pile of one type. <b>Solar Satellites</b> and <b>Crawlers</b> never leave their planet.</li>
        <li><b>Crawlers</b> add +0.1% to every mine each, to a maximum of +50% overall and no more than 6 per level across your three mines. Each working crawler draws 6 energy, so build power for them. They are fragile and can only live on planets.</li>
        <li><b>Pathfinders</b> are built for deep space: each one adds 10% to expedition finds (five count) and has a 20% chance to steer the fleet clear of a black hole. <b>Recyclers</b> collect debris fields. <b>Espionage Probes</b> spy. <b>Colony Ships</b> settle new planets.</li>
        <li><b>Missiles.</b> A <b>Missile Silo</b> stores missiles (10 slots per level; an interplanetary missile takes 2, an anti-ballistic missile 1) and sets the range (5 systems per level, minus one). Interplanetary missiles destroy defenses - never ships - and the target's anti-ballistic missiles each intercept one.</li>
      </ul>
    ),
  },
  {
    id: 'planets', title: 'Planets, colonies and moons',
    body: (
      <ul>
        <li><b>Colonizing.</b> Send a Colony Ship to an empty position. How many planets you may hold is set by <b>Astrophysics</b> (one more planet for every two levels). Distance, temperature and position decide a planet's size and what it is good at. You can <b>abandon</b> a colony, never your homeworld.</li>
        <li><b>Every world has its own picture and banner.</b> A planet is given one of nineteen looks (a moon one of twenty-nine) when it is first needed, and keeps it for as long as it exists. A planet's look is chosen from the ones that suit its temperature: lava, desert, chrome and shattered worlds at the hot positions, ice, aurora and twilight worlds far out, oceans, swamps and jungles in between. The <b>Overview</b> opens with the world's wide banner: its kind (Desert planet, Tempest moon) and a line about it, your role for it, a switch between the planet and its moon, and the facts you check most (size, building fields in use, the highest temperature, the orbit bonus, what it makes an hour and its energy). The same picture shows on the planet bar and the Empire page.</li>
        <li><b>Roles.</b> Give each planet a role on its Overview: Mining, Fleet base, Fortress or Research. A role changes no numbers; it lets the game suggest a next building for that planet when its queue is empty (in What to do next), shows as a badge on the Empire page, and makes an empty Fortress a warning.</li>
        <li><b>Orbit matters.</b> Positions 1-3 give bonus crystal (+40%, +30%, +20%); positions 6-10 give bonus metal (+17%, +23%, +35% at position 8, +23%, +17%). Hot planets make less Vespene Gas, cold planets more.</li>
        <li><b>Moons.</b> After a battle over a planet that has no moon yet, there is a 20% chance that the debris above it condenses into a moon. The whole debris field counts, including what earlier battles left behind and nobody has recycled: with 100,000 resources or more the chance is the full 20%, and a smaller field gives a proportionally smaller chance. The moon belongs to the planet's owner. For a certain moon there is the <b>Moon Forge</b>, a late-game option shown on the Overview card of a planet that has no moon yet. It needs Graviton Technology 1, a Shipyard of level 12 on that planet, and a debris field of at least 1,000,000 resources above it. It uses up the whole field and costs vespene gas equal to the debris, plus a quarter of the debris in metal and another quarter in crystal. It takes 12 hours, shown in the Events list, and then the moon appears; a bigger field makes a bigger moon, from 3,000 km at 1,000,000 up to 8,000 km at 5,000,000 or more. The debris is gone the moment the forge starts, so nobody can recycle it, and cancelling returns what you paid but not the debris. On the Overview a planet and its moon are shown side by side; click either to switch. A moon can hold a Lunar Base, Sensor Phalanx, Jump Gate, Robotics Factory, Shipyard and Missile Silo; it has no mines, so it cannot build the storage buildings either. Moons are tiny: a <b>Lunar Base</b> adds usable fields (3 per level). A <b>Sensor Phalanx</b> scans fleet movements around the moon within (level² − 1) systems for 5,000 Vespene Gas a scan. A <b>Jump Gate</b> teleports ships between your own moons that have gates, with a cooldown.</li>
        <li><b>Destroying a moon.</b> Deathstars sent on a <i>Destroy moon</i> mission can wreck a moon. More Deathstars and a smaller moon raise the odds, and the shock wave can destroy the Deathstars. Everything on the moon is lost.</li>
      </ul>
    ),
  },
  {
    id: 'fleets', title: 'Fleets and missions',
    body: (
      <>
        <ul>
          <li>Pick a planet, choose ships, a target and a mission on the <b>Fleet</b> page, or start from a button in the <b>Galaxy</b>. The page shows flight time and fuel before you launch. Flights cost <b>Vespene Gas</b>; a lower speed percentage uses less. You can <b>recall</b> a fleet at any time and it returns after the time it already travelled.</li>
          <li><b>Repeating and recalling.</b> <b>Repeat last</b> at the top of the send form fills in the ships, target, mission, speed and cargo of your previous dispatch (only the ships that are at this planet), ready to check and send. Your own moving fleets in the Overview events list have a <b>Recall</b> button; a recalled fleet turns around at once and asks you to confirm first.</li>
          <li><b>The Fleet page.</b> Every coordinate on it is a link that opens the galaxy at that system. Under the ship list it shows the <b>transport capacity</b> of the ships you selected, and for Recyclers also their <b>recycling capacity</b>. Below the target boxes, buttons with your own planets and moons fill in their coordinates in one click. When you carry resources, a small <b>max</b> link under each amount fills in as much as the planet has and the hold can take (for vespene gas, less the fuel). Number fields everywhere group the digits as you type, so 2000000 reads as 2,000,000 (2.000.000 in German). Pressing <b>Spy</b> in the galaxy prepares the number of Espionage Probes set under <b>Settings</b> (default 1, 0 prepares none).</li>
          <li><b>Events.</b> The <b>Overview</b> lists every fleet movement that concerns you, in the order it will happen, each with its clock time, a countdown, where it comes from, where it goes and its mission. Point at the word <b>fleet</b> in a line (no click needed) to see what the fleet is made of. Fleets that carry resources say "transporting resources": point at those words to see how much of each, and the total. Your own fleets appear in green: the arrival at the target and, in fainter italics, the return flight that will follow. Attacks on you appear in red; attacks on one of your allies appear in amber, so red always means you are the target; friendly deliveries and stationed fleets appear in blue. For an enemy fleet, what you see when you point at it depends on your Espionage Technology compared with the sender's: if theirs is higher, nothing; at the same level or ahead, how many ships; two levels ahead, the types; four levels ahead, the exact fleet. The Fleet page's list of inbound fleets shows the same details, and the sender, launch planet and target there link to profiles and the galaxy. Names of players and planets are links. Hide collapses the list and the choice is remembered.</li>
          <li><b>Fleet slots</b> limit how many fleets fly at once: 1, plus Computer Technology levels, plus Fleet Admiral ranks, plus class and alliance bonuses. <b>Expeditions</b> have their own slots.</li>
          <li><b>Fleet presets</b> save a ship selection under a name; they follow your account to any device. Bookmarks and recent targets appear as quick buttons above the target box.</li>
        </ul>
        <table className="table">
          <thead><tr><th>Mission</th><th>What it does</th></tr></thead>
          <tbody>
            <tr><td>Attack</td><td>Fights the defender, steals up to half their stock (limited by cargo space) and can leave a debris field. Allies can <b>join</b> your attack from the Fleet page so everyone arrives together.</td></tr>
            <tr><td>Destroy moon</td><td>Deathstars only, against a moon. See Planets, colonies and moons.</td></tr>
            <tr><td>Transport</td><td>Delivers resources to any planet, yours or not.</td></tr>
            <tr><td>Deploy</td><td>Moves ships to another of your planets and keeps them there.</td></tr>
            <tr><td>Defend ally (hold)</td><td>Stations your fleet at an ally's planet for up to 48 hours; it fights beside their defenses against attackers and raiders.</td></tr>
            <tr><td>Espionage</td><td>Probes return a report. More probes and more Espionage Technology than the target reveal more: resources, then fleet, defenses, buildings and finally research. Weak probes can be shot down.</td></tr>
            <tr><td>Colonize</td><td>Settles an empty planet with a Colony Ship.</td></tr>
            <tr><td>Recycle</td><td>Recyclers collect a debris field.</td></tr>
            <tr><td>Expedition</td><td>Explores deep space. See Expeditions.</td></tr>
          </tbody>
        </table>
        <p className="muted small">Hostile fleets heading for you are listed on the Fleet page and in the red bar at the top, with who sent them and the planet and coordinates they launched from.</p>
      </>
    ),
  },
  {
    id: 'battles', title: 'Battles, loot and wrecks',
    body: (
      <ul>
        <li>A battle lasts up to 6 rounds. Every ship and defense shoots at random enemies each round; shields absorb small hits, and damaged units can blow up early. Technologies for weapons, shielding and armour make every unit stronger.</li>
        <li>The <b>Simulator</b> (Space group) replays a battle many times and shows the odds, the losses, the debris and the <b>chance of a moon</b>; its field <b>Debris already there</b> lets you include debris left by earlier battles, which raises that chance.</li>
        <li><b>Share links.</b> A battle report, a planet and a build order can each be shared as a public link that opens without logging in. <b>Share this planet</b> on the Overview makes a snapshot of its size, buildings and your research (ships and defenses only if you tick the box); <b>Share my queue as a build order link</b> on Buildings and Research makes the running and waiting jobs into an ordered list. Someone who opens an order link while logged in can queue the steps they still lack on their selected planet. Links show the moment they were made and do not change afterwards.</li>
        <li><b>Battle replay.</b> Any battle report with its round-by-round record can be watched: <b>Watch the replay</b> in the message, or in the full report and on a shared report link. Attackers stand on the left and defenders on the right, one picture for each ship or defense (a big fleet is shown with each picture standing for many units, and the numbers above still count every one). Each round the beams cross the gap, shots absorbed by shields flash blue, and the units destroyed that round burst and vanish; the totals above each side count down as they fall, and the bottom shows what is left of each type. <b>Pause</b>, <b>Play</b>, <b>Round</b> buttons that step a round at a time, the slider and the speed (half to four times) control it, and the line under the picture tells each round in words. With reduced motion switched on in your system the replay steps from round to round without moving effects. The Simulator can replay the first of its runs the same way.</li>
        <li>The <b>battle report</b> in your messages shows the result: who won, what each side had and has left, loot, debris and what happened with the moon. After a battle over a planet without a moon it says whether a moon formed, and if not, the chance there was given the debris field above the planet; if a moon forms over one of your planets you also get a separate message. <b>Full battle report</b> opens a window with every round: for each side the shots fired, the damage, how much of it the enemy shields absorbed, how much reached hulls and how many units were destroyed, plus the units left after each round. <b>Share link</b> makes a public page that shows the same full report, to paste anywhere.</li>
        <li><b>Debris.</b> Destroyed ships leave a debris field (about 30% of their cost, more with a Geologist or the General class) that Recyclers collect, including the field above your own planet or moon. A recycler fleet takes metal and crystal together, in the proportion they lie in the field, so a full load is a mix of both rather than all of one kind. Defenses are not recycled, but about 70% of destroyed defenses rebuild on their own after the battle.</li>
        <li><b>Wreck fields and the Space Dock.</b> If a defender loses enough ships (100,000 resources worth), a wreck field forms over the planet. A <b>Space Dock</b> there rebuilds a share of it for free (3.5% per level, up to 35% at level 10, and never more) in a short repair. The wreck drifts away after 72 hours, and a repair in progress is never cancelled. Only the defender gets a wreck field; computer empires and moons do not.</li>
        <li><b>Protection.</b> A commander under 200 points can neither attack nor be attacked, and while someone is under 5,000 points a player with more than five times their points cannot attack them either. The Galaxy marks these: <b>n</b> newbie protection, <b>s</b> too strong for you, <b>v</b> on vacation (untouchable), <b>i</b> inactive 7+ days, <b>I</b> inactive 28+ days, and a dot for online now. Computer empires are always fair game, and allies and pact partners cannot attack each other.</li>
      </ul>
    ),
  },
  {
    id: 'galaxy', title: 'Reading the galaxy',
    body: (
      <ul>
        <li>The galaxy has a few galaxies, each with systems and numbered positions. Each row shows the planet, its owner, their alliance or faction, and any debris field. Buttons start a mission against that position: Spy, Attack, Transport and Defend on other commanders' planets, Deploy on your own, Colonize on empty positions, and <b>Recycle</b> on any position that has a debris field, including the one above your own planet.</li>
        <li><b>Pirate and alien outposts</b> are fixed targets that belong to nobody: the Galaxy lists them (nearest first) with a strength from 1 to 4 and marks them in the system list. An outpost holds a garrison, measured against the fleets of the commanders who played this week, and a treasure you can loot. The first fleet that breaks one earns <b>Command Credits</b>, shared by the commanders in that fleet (about 20, 45, 100 or 220 by strength), and an achievement for the first one. It then stands cleared, still lootable, and is rebuilt after some hours with a garrison that fits the fleets of the day. Spy before you attack: alien outposts bring ships of one kind, with the weak points described under Void invasions. Use the filters to show only outposts, only inactive targets or hide protected ones. <b>Bookmark</b> a system with the star, and the Galaxy remembers your recent targets. The 📝 button keeps a private note on a position; notes on commanders show there too. Click a planet's position number to show its <b>banner</b> above the list, with the planet's name, coordinates and commander.</li>
        <li>Spies are most useful against <b>inactive</b> commanders and empires: they never spend what they hoard. Your latest report on each planet is kept under <b>Contacts</b>. At the top of a spy report the coordinates are a link to the galaxy, and buttons <b>Attack</b>, <b>Spy again</b> and <b>Transport</b> open the Fleet page with that planet already chosen as the target. Spy reports and battle reports open with the banner of the planet they were about.</li>
        <li>The last position of every system, one past the planets, is <b>deep space</b>, where expeditions go.</li>
      </ul>
    ),
  },
  {
    id: 'expeditions', title: 'Expeditions',
    body: (
      <ul>
        <li><b>The expedition chart.</b> The Expeditions card at the top of the Fleet page draws every expedition that is out: your planet in the middle, a spoke to deep space (the outer ring) for each fleet, and a ship riding along its spoke. Orange is flying out, purple is exploring (the ship waits at the ring and pulses), green is coming home. Beside it each fleet has a timeline split into out, exploring and back with a white marker for now, the time left in the current part, when it will be home (before the result is known, counted as if it stays the full time you chose), the ships and what it carries home. <b>Recall</b> turns a fleet around while it is still going out or exploring. The latest five expedition results are listed underneath.</li>
        <li>An expedition needs <b>Astrophysics</b> and a free expedition slot (the square root of your Astrophysics level, rounded down, plus bonuses). Choose how long to stay out, <b>1-4 hours</b>: each extra hour finds about 30% more but widens the black-hole risk.</li>
        <li>Outcomes range from nothing, resources, Command Credits and derelict ships joining you, to pirate ambushes, delays, a tailwind home, an ancient data cache that speeds up your current research, and rarely a black hole that swallows the fleet. Bigger fleets find more and meet bigger pirates.</li>
        <li><b>What to bring:</b> a few <b>Pathfinders</b> (more finds, can dodge black holes), a <b>Recycler</b> (+25% resource finds and wreckage salvage), a probe or two (pirate fleets 25% smaller), and enough warships to survive an ambush. The Discoverer class and Geologist officer boost everything.</li>
      </ul>
    ),
  },
];
