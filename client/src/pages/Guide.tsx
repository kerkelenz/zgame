import type { ReactNode } from 'react';
import { useGame } from '../game';
import { ResIcon } from '../ResIcon';
import { Card, Page } from '../ui';

interface Topic { id: string; title: string; body: ReactNode }

const TOPICS: Topic[] = [
  {
    id: 'basics', title: 'The basics',
    body: (
      <>
        <p>You are a commander with one homeworld in a shared galaxy. You mine resources, research technology, build ships and defenses, expand to new planets, and trade blows - or favours - with other commanders and with computer-run empires. Everything keeps running while you are away, so the game is about planning: queue work, protect yourself, and check in.</p>
        <ul>
          <li><b>The menu</b> on the left is grouped: <b>Planet</b> (the selected planet, including the Tech tree), <b>Space</b> (fleets and the galaxy), <b>Empire</b>, <b>Social</b> and <b>More</b>. Click a heading to open or close its group; your choice is remembered, and the group you are working in stays open. A heading shows the unread count when it is closed. A few pages appear only when they are useful: <b>Automation</b> once your economy has grown a little, <b>Territory</b> when you are in an alliance, <b>Invasion</b> during a Void invasion (and afterwards, for the record), and the <b>Simulator</b> once you have a shipyard or have fought. <b>Settings</b> can show every page all the time. <b>More</b> holds Settings, this Guide, the <b>release notes</b> page and, for admins, the Admin page.</li>
          <li><b>Overview</b> is your planet at a glance with the current <b>objective</b> that teaches the game step by step. <b>Empire</b> shows all your planets together. <b>Economy</b> explains your income.</li>
          <li><b>Resources, Buildings, Research, Shipyard, Defense</b> run the selected planet (pick it in the top bar). <b>Automation</b> does routine work for you and <b>Contracts</b> pays you for the things you do anyway. <b>Fleet</b> and <b>Galaxy</b> are where ships move; <b>Territory</b> shows which alliance holds which system and <b>Invasion</b> is where the whole server fights the Void.</li>
          <li><b>Alliance, Contacts, Messages, Chat, Standing</b> are the social side; <b>Command</b> holds your class, officers, factions and achievements; <b>Settings</b> holds your account, alerts and vacation mode.</li>
          <li>Click <b>any item name</b> (a building, technology, ship or defense, here or in a requirement list) to open its <b>details page</b>: what each level gives, what it costs, and what it unlocks. The <b>Simulator</b> predicts a battle before you fly it.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'resources', title: 'Resources, energy and storage',
    body: (
      <ul>
        <li><b><ResIcon k="metal" /> Metal</b> (steel ingots) is the backbone of nearly every building and ship. <b><ResIcon k="crystal" /> Crystal</b> (the blue gem) goes into research, electronics and most ships. <b><ResIcon k="deuterium" /> Vespene Gas</b> (the glowing green canister) fuels your fleets and pays for advanced technology.</li>
        <li>Mines produce all three. Every planet also has a small free income of metal and crystal. The top bar shows your current stock against your storage limit; a resource at its limit stops growing, so build <b>storage</b> (Metal Storage, Crystal Storage, Vespene Tank) before it sits capped.</li>
        <li><b>Energy.</b> Mines need power. Build <b>Solar Plants</b> first, later <b>Fusion Reactors</b> (burns Vespene Gas) and <b>Solar Satellites</b> (ships that stay in orbit). If the energy balance in the top bar is negative, every mine slows down proportionally. Extra mine levels give less and less once the planet cannot power them; the details pages show this level by level.</li>
        <li>The <b>production sliders</b> on the Resources page let you run a mine below 100% to save energy.</li>
        <li>Moons produce nothing. Storage does not protect against raids, so spend what you can.</li>
      </ul>
    ),
  },
  {
    id: 'build', title: 'Buildings, research and queues',
    body: (
      <ul>
        <li><b>Buildings</b> upgrade one level at a time and take time that shrinks with the <b>Robotics Factory</b> and the <b>Nanite Factory</b>. A planet has a limited number of building fields; a <b>Terraformer</b> adds more.</li>
        <li><b>Research</b> needs a <b>Research Lab</b> and runs one project at a time across your whole empire. Technologies unlock ships, speed up drives, strengthen weapons, shields and armour, and raise limits like how many planets you can hold. The Lab cannot be upgraded while research is running.</li>
        <li><b>Queues.</b> Each of buildings and research can queue four jobs behind the running one. A queued job is <b>paid for and reserved the moment you queue it</b> and refunded if you remove it, so it can never fail later for lack of resources. Use the arrows to reorder. If an item is already being upgraded or queued, its card shows the <i>later</i> level and that level's real price; the button only enables when you can afford exactly what you will get.</li>
        <li>Requirements are shown on every card; a requirement you meet turns green. Some buildings are moon-only and some planet-only.</li>
        <li><b>Tech tree.</b> The Tech tree page (in the Planet group) is a map of everything you can build, research or train. Each building, research, ship and defense is one card showing your level (for example Energy Technology, Level 3 / 12). Rows group the cards by purpose (Economy, Research, Fleet, Defense and Moon buildings) and columns are steps left to right, so whatever a card needs sits in a column to its left and is joined to it by an arrow (faint arrows come from items that feed many others, such as the Shipyard). Cards you have are green, cards whose requirements you already meet glow because you can start them now, and the rest are dimmed as locked. Click a card to light every step that leads to it and everything it opens, and to open its levels in place: the levels the lit arrows need are ringed. A panel lists the path to get there in order with your progress. <b>Show only the path to</b> any item hides everything else and lays out just what that item needs, with arrows labelled by the level required, ticks on what you have and the steps you can start right now listed first. The map has no scroll bars: drag it with the mouse or a finger to pan, use the wheel or a two-finger pinch to zoom, press Fit all for the whole picture, or use the jump list to find an item. Its second view, <b>Production and effects</b>, lists what raises each output (metal, crystal, vespene gas, energy, construction, research and shipbuilding speed, fleet speed and strength, planets and slots) and what limits it, with your current levels beside each item.</li>
        <li>Research projects that need a minimum energy output say so on their card.</li>
      </ul>
    ),
  },
  {
    id: 'automation', title: 'Automation: build orders and rules',
    body: (
      <ul>
        <li>A <b>build order</b> is a list of steps, each meaning <i>raise this building or technology to level N</i>. Run one on a planet (the one selected in the top bar) and the server works through it while you are away: it starts the next building and the next research as soon as you can afford them, in the order you wrote them. Buildings and research run side by side.</li>
        <li>It never drops a step: if you cannot pay yet, it waits. If a step needs something you do not have, the missing building or technology is <b>added automatically</b> before it. It will not touch a queue you filled by hand - it waits for it to clear - and it pauses while you are on vacation.</li>
        <li>The Automation page offers <b>ready-made orders</b> (an economy opener, a science start, a colony starter). Copy one into the editor to change it, or build your own from scratch and save up to twelve. A running order shows every step with a tick when it is reached, and a status line saying what it is doing or waiting for. <b>Stop</b> ends it at any time.</li>
        <li><b>Rules</b> react to events. <i>Keep the lights on</i> builds a Solar Plant on a planet that runs short of energy. <i>Never cap out</i> upgrades a storage building when a resource reaches 90% of its limit. <i>Dig in when attacked</i> queues defenses of a type you choose when a hostile fleet is heading for one of your planets - once per fleet, never more than your count, and never spending more than the percentage of that planet's stock you set. Rules only start work when the planet has no building in progress.</li>
        <li>The log on the Automation page lists everything the server did for you.</li>
      </ul>
    ),
  },
  {
    id: 'contracts', title: 'Contracts',
    body: (
      <ul>
        <li>The <b>Contracts</b> page offers three <b>daily</b> and two <b>weekly</b> contracts, picked for you from jobs you can actually do: finish buildings, complete research, build ships or defenses, bring back spy reports, win battles, repel raider fleets, complete expeditions, collect debris, deliver resources to alliance members, or plunder. Targets for resource amounts grow with the universe's speed.</li>
        <li>Progress counts only what you do after the contract appears, and each contract has a progress bar. When it is full, press <b>Claim</b> for Command Credits. A number appears in the menu and on the Overview while something is waiting.</li>
        <li><b>Streak.</b> Claim at least one daily on consecutive days and every daily claim pays an extra 2 credits per streak day, up to +20. Miss a whole day and the streak starts again. Finishing and claiming <b>all three</b> dailies in a day adds a bonus.</li>
        <li>New dailies appear at midnight (UTC) and new weeklies on Monday; anything unclaimed is replaced. Weeklies pay several times a daily but have no streak bonus. Credits buy officers, a class change and Supply depot items in Command.</li>
      </ul>
    ),
  },
  {
    id: 'ships', title: 'Ships, defenses and missiles',
    body: (
      <ul>
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
        <li><b>Orbit matters.</b> Positions 1-3 give bonus crystal (+40%, +30%, +20%); positions 6-10 give bonus metal (+17%, +23%, +35% at position 8, +23%, +17%). Hot planets make less Vespene Gas, cold planets more.</li>
        <li><b>Moons.</b> When a battle leaves debris, there is a 1% chance per 100,000 resources of debris (up to 20%) that it condenses into a moon over the planet. Moons are tiny: a <b>Lunar Base</b> adds usable fields (3 per level). A <b>Sensor Phalanx</b> scans fleet movements around the moon within (level² − 1) systems for 5,000 Vespene Gas a scan. A <b>Jump Gate</b> teleports ships between your own moons that have gates, with a cooldown.</li>
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
          <li><b>Events.</b> The <b>Overview</b> lists every fleet movement that concerns you, in the order it will happen, each with its clock time, a countdown, where it comes from, where it goes and its mission. Your own fleets appear in green: the arrival at the target, and below it, in fainter italics, the return flight that will follow. Hostile fleets heading for you or your allies appear in red with who sent them and from where (their ships stay hidden), and friendly deliveries and stationed fleets in blue. Names of players and planets are links to their profile and to the galaxy. Hide collapses the list and the choice is remembered.</li>
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
        <li>The <b>battle report</b> lists both sides' losses round by round. <b>Share link</b> on a report makes a public page you can paste anywhere.</li>
        <li><b>Debris.</b> Destroyed ships leave a debris field (about 30% of their cost, more with a Geologist or the General class) that Recyclers collect, including the field above your own planet or moon. Defenses are not recycled, but about 70% of destroyed defenses rebuild on their own after the battle.</li>
        <li><b>Wreck fields and the Space Dock.</b> If a defender loses enough ships (100,000 resources worth), a wreck field forms over the planet. A <b>Space Dock</b> there rebuilds a share of it for free (30% + 6% per level, up to 90%) in a short repair. The wreck drifts away after 72 hours, and a repair in progress is never cancelled. Only the defender gets a wreck field; computer empires and moons do not.</li>
        <li><b>Protection.</b> A commander under 200 points can neither attack nor be attacked, and while someone is under 5,000 points a player with more than five times their points cannot attack them either. The Galaxy marks these: <b>n</b> newbie protection, <b>s</b> too strong for you, <b>v</b> on vacation (untouchable), <b>i</b> inactive 7+ days, <b>I</b> inactive 28+ days, and a dot for online now. Computer empires are always fair game, and allies and pact partners cannot attack each other.</li>
      </ul>
    ),
  },
  {
    id: 'galaxy', title: 'Reading the galaxy',
    body: (
      <ul>
        <li>The galaxy has a few galaxies, each with systems and numbered positions. Each row shows the planet, its owner, their alliance or faction, and any debris field. Buttons start a mission against that position.</li>
        <li>Use the filters to show only inactive targets or hide protected ones. <b>Bookmark</b> a system with the star, and the Galaxy remembers your recent targets. The 📝 button keeps a private note on a position; notes on commanders show there too.</li>
        <li>Spies are most useful against <b>inactive</b> commanders and empires: they never spend what they hoard. Your latest report on each planet is kept under <b>Contacts</b>.</li>
        <li>The last position of every system, one past the planets, is <b>deep space</b>, where expeditions go.</li>
      </ul>
    ),
  },
  {
    id: 'expeditions', title: 'Expeditions',
    body: (
      <ul>
        <li>An expedition needs <b>Astrophysics</b> and a free expedition slot (the square root of your Astrophysics level, rounded down, plus bonuses). Choose how long to stay out, <b>1-4 hours</b>: each extra hour finds about 30% more but widens the black-hole risk.</li>
        <li>Outcomes range from nothing, resources, Command Credits and derelict ships joining you, to pirate ambushes, delays, a tailwind home, an ancient data cache that speeds up your current research, and rarely a black hole that swallows the fleet. Bigger fleets find more and meet bigger pirates.</li>
        <li><b>What to bring:</b> a few <b>Pathfinders</b> (more finds, can dodge black holes), a <b>Recycler</b> (+25% resource finds and wreckage salvage), a probe or two (pirate fleets 25% smaller), and enough warships to survive an ambush. The Discoverer class and Geologist officer boost everything.</li>
      </ul>
    ),
  },
  {
    id: 'economy', title: 'Growing your economy',
    body: (
      <ul>
        <li>The <b>Economy</b> page shows where income comes from (mines, technology, orbit, crawlers, bonuses, energy losses), when your stores fill, and ranks upgrades by how fast they pay for themselves.</li>
        <li>The <b>travelling merchant</b> (Resources page) swaps resources at 3 metal : 2 crystal : 1 Vespene Gas and keeps a 12% cut (8% for Collectors). Each day he also offers one trade at only a 2% cut, up to a daily allowance - the page shows today's deal and when it resets.</li>
        <li><b>Gather</b> sends cargo ships from all your other planets, loaded with a share of their stock (fuel kept back), to the planet you are viewing.</li>
        <li>The <b>Supply depot</b> in Command spends Command Credits on production crates and on halving the time left on your current building or research.</li>
        <li>Keep a reserve of Vespene Gas for fuel, and spend resources before a planet's stores fill.</li>
      </ul>
    ),
  },
  {
    id: 'empires', title: 'Computer empires, raiders and factions',
    body: (
      <ul>
        <li><b>Computer empires</b> fill the galaxy. <i>Inactive</i> ones never spend, so spying on them and taking their stockpile is the classic early income. <i>Active</i> ones build up, and <i>aggressive</i> ones raid you. A grudge from your own raids can turn any empire hostile.</li>
        <li><b>Raiders</b> attack commanders periodically. You always get at least 10 minutes of warning, and your allies are told too. Defenses and stationed allied fleets turn raids into profit: when raiders are crushed everyone who defended shares a bounty.</li>
        <li>A strong hostile empire may <b>demand tribute</b>. Paying buys a truce; refusing or ignoring it brings their fleet. Answer in <b>Command</b> before the deadline.</li>
        <li><b>Factions.</b> Raiding a faction's empires costs standing with it and earns half as much with its rival. At 40 standing you may join one: its members stop raiding you and you get its perk (Concord of Iron +10% shields, Verge Syndicate +15% plunder and +10% cargo, Solar Covenant +8% mine output, Black Chain +10% weapons). Attack a member of your own faction and you are out.</li>
      </ul>
    ),
  },
  {
    id: 'command', title: 'Command: classes, officers, credits and achievements',
    body: (
      <ul>
        <li><b>Command Credits</b> come from objectives, achievements, the winner of a season and a fraction of expeditions. They buy officers, a class change and Supply depot items.</li>
        <li><b>Classes</b> - choose one in Command; the first choice is free, changing later costs 2,000 credits. <b>Collector:</b> +15% mine output, +10% energy, +25% cargo on Small and Large Cargo ships, a cheaper merchant, crawlers 25% stronger. <b>General:</b> +2 fleet slots, 25% less fuel, +25% speed for combat ships and recyclers, a little more debris. <b>Discoverer:</b> +1 expedition slot, +50% expedition finds, half the ambushes and black holes, +10% research speed, bigger colonies.</li>
        <li><b>Officers</b> are permanent upgrades with three ranks each: Quartermaster (mines), Chief Engineer (build, research and ship time, energy), Fleet Admiral (fleet and expedition slots), Spymaster (better reports, fewer lost probes) and Geologist (debris and expedition finds).</li>
        <li><b>Objectives</b> on the Overview walk you through the first hours with rewards. <b>Achievements</b> pay credits for milestones such as reaching a mine level, winning battles, holding planets, destroying a moon or helping destroy a Void Armada.</li>
      </ul>
    ),
  },
  {
    id: 'alliance', title: 'Alliances',
    body: (
      <ul>
        <li>Found or join an alliance (open ones let you in directly; closed ones take applications). Members share a <b>bank</b> everyone can donate to; permitted members grant from it and buy <b>alliance upgrades</b> that help every member: a mining network (+2% mine output per level), a research institute (-3% research time), allied logistics (+3% fleet speed) and a joint command (+1 fleet slot per two levels).</li>
        <li><b>Defending each other.</b> Send a <i>Defend ally (hold)</i> fleet to a member's planet. Fleets stationed with allies go home if the alliance bond ends. For attacks, members can <b>join each other's attacks</b> to land together.</li>
        <li><b>Ranks and permissions.</b> The founder creates custom ranks and gives each any of: review applications, remove members, grant from the bank, buy upgrades, edit the description, message everyone, post on the bulletin board, and handle diplomacy. Plain officers have all of these; plain members none. A member with a rank cannot remove another ranked member.</li>
        <li><b>Bulletin board</b> for standing orders (pin the important ones) and <b>messages to everyone</b> from permitted members. The member list shows each member's rank and home coordinates; click a name for their profile.</li>
        <li><b>Diplomacy.</b> A <b>pact</b> needs both alliances to agree and stops either side attacking the other. Either side can end a pact at any time. Wars work differently and have their own entry below.</li>
        <li><b>Wars.</b> An officer with the diplomacy permission can declare a <b>war</b> on another alliance. Both alliances need at least 2 members, and each can fight only one war at a time. A war lasts 48 hours (the server can change this) and marks the enemy in the Galaxy; it replaces any pact. Both alliances <b>score points</b>: 1 point for every 1,000 resources of value of enemy units (ships and defenses) your side destroys in battles against that alliance, whoever attacked, and 15 points per hour for every system your alliance holds. The higher score wins when time runs out, and level scores are a draw. Your alliance page shows the score, who is scoring and when it ends.</li>
        <li><b>War prizes.</b> The winning alliance gets a quarter of the value the loser's side lost, up to 5 million, added to its bank, and the winning fighters share 400 Command Credits by how many points they scored (at least 20 each). No prize is paid unless the winner scored at least 50 points by fighting, so a war won by holding systems alone pays nothing. Ending a war early is a surrender: the other side wins at once, with the normal prize if they had fought. The same two alliances must wait 24 hours before fighting again. Battles with outsiders, pirates and the Void do not count.</li>
        <li>Alliance chat is in <b>Chat</b>; the activity log on the Alliance page records who did what.</li>
      </ul>
    ),
  },
  {
    id: 'invasion', title: 'Void invasions',
    body: (
      <ul>
        <li>Every few days a <b>Void Armada</b> opens a rift in deep space. Everyone is told hours ahead (a bar across the top and a message), with the rift's coordinates. When it opens the Armada stays for a day, then withdraws if it is not destroyed.</li>
        <li>Send combat fleets with the mission <b>Join the invasion front</b> (on the Fleet page, or from the button on the Invasion page). A fleet that reaches the rift waits there. Every 30 minutes <b>every fleet at the rift fights the Armada as one force</b>, in a normal six-round battle with your technologies. Survivors stay for the next engagement until you <b>recall</b> them or the event ends; fleets that are wiped out are lost.</li>
        <li><b>Coordinate.</b> The Armada is a bit over a third of all the combat fleets on the server at the moment it was announced (fleets you build after the announcement are extra), and its technology rises with each wave. A fleet weaker than the Armada is destroyed, but it still does real damage: roughly 15% of the Armada at half its strength, 30% at four fifths, and half of it at equal strength. To destroy the Armada in one engagement you need a combined force about 20% stronger than it. Damage stays: the Armada only rebuilds 5% of its starting fleet before each engagement, so waves that follow each other can finish it, but a trickle never will. The Invasion page shows the combined force at the front against the Armada and the countdown to the next engagement.</li>
        <li><b>Rewards.</b> Damage is credited to each commander by their share of the firepower at the front. If the Armada is destroyed, a pool of Command Credits (600 plus 100 per participant, up to 3,000) is split by damage share, everyone who fought gets at least 25, and anyone with a real share earns the <b>Void Slayer</b> achievement. If it withdraws, a third of that pool is shared as a consolation. Top commanders and alliances are listed, and earlier waves are kept on the Invasion page.</li>
        <li>You receive one rolling report per round at the front (it replaces the previous one) with the round-by-round battle, and a final message with your damage and credits.</li>
      </ul>
    ),
  },
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
        <li>Click a commander's name anywhere (Standing, the Galaxy, Contacts, your alliance) for their <b>profile</b>: rank in every category, record, class, alliance, achievements and <b>where all their planets are</b>. Resources, fleets and queues are always private. Back returns to the page you came from.</li>
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
        <li><b>Points</b> come from what you have invested: 1 point per 1,000 resources spent on buildings, research, ships and defenses. <b>Standing</b> ranks everyone by total points and by economy, research, fleet, defense, battles won, resources destroyed, plundered, recycled, expeditions, raids repelled and moons destroyed. Alliances are ranked by the sum of their members. The rankings refresh every fifteen seconds or so. Charts show your points and rank over time.</li>
        <li>Some universes run in <b>seasons</b>. Standing shows the time left and any victory score. When a season ends the champion earns Command Credits and an achievement, the top players enter the <b>hall of fame</b>, and after a short grace period the universe resets: everyone starts on a fresh homeworld. You keep your account, credits, officers, class, achievements, alliance and contacts.</li>
      </ul>
    ),
  },
  {
    id: 'account', title: 'Your account, alerts and vacation',
    body: (
      <ul>
        <li><b>Settings</b> hold your account: change password, rename (once every 7 days; your homeworld is renamed too) and delete. Make a <b>recovery key</b> - there is no email reset, and a key is the only way back in if you forget your password. Logins expire after 30 days without use, and <b>Log out</b> signs that device out.</li>
        <li><b>Alerts outside the game.</b> Add a Discord webhook or an ntfy topic (a free phone app) and choose what to be told about: attacks, raids and missiles aimed at you, allies under attack, tribute demands, finished construction, research, ships and objectives, and private messages. You can limit alerts to when you are away. Browser notifications, sound cues, the tab title (unread messages and incoming fleets) and a language choice are in Settings too.</li>
        <li><b>Install the app and push notifications.</b> Settings offers <b>Install the app</b> (or your browser's Install / Add to Home Screen) so the game opens like an app, and <b>Turn on for this device</b> to get a notification on that phone or computer when you are attacked, an ally needs help, tribute is demanded or something finishes - even with the game closed. Each device is turned on separately; the same alert categories and the "only when I am away" switch apply as for Discord and ntfy. On an iPhone or iPad the game must first be added to the Home Screen (Share, then Add to Home Screen). Push needs a secure (https) connection.</li>
        <li><b>Vacation mode</b> freezes your empire and makes you untouchable while you are away: nothing is produced, built or researched and nobody can attack or spy on you. To start, your empire must be quiet (no fleets in flight, no queues, no hostile fleets heading for you, no allied fleets stationed with you). It lasts at least 48 hours and you cannot do anything until you end it.</li>
        <li>The <b>welcome tour</b> can be replayed from Settings.</li>
      </ul>
    ),
  },
];

const ADMIN: Topic = {
  id: 'admin', title: 'Admin tools',
  body: (
    <ul>
      <li>The <b>Admin</b> page lists every commander. <b>Ban</b> and <b>Mute</b> take an optional number of hours (blank is permanent) and a reason the player sees. <b>Raid</b> sends a computer-empire raid, <b>Inspect</b> shows a commander's full state (without password data), <b>Remove</b> deletes them, and you can <b>gift resources</b> to a homeworld.</li>
      <li><b>Announcement</b> messages every commander and pops a notice for anyone online. <b>Player reports</b> sent from profiles queue up until you resolve them.</li>
      <li><b>Void invasion:</b> start one by hand (you choose how many minutes until the rift opens) or end the current one early; waves otherwise come on their own schedule.</li>
      <li><b>Season:</b> end the current season (crowns the champion and fills the hall of fame), then reset the universe. Admins cannot be banned, muted or removed from this page.</li>
    </ul>
  ),
};

export function Guide() {
  const { me } = useGame();
  const topics = me.player.admin ? [...TOPICS, ADMIN] : TOPICS;
  const go = (id: string) => document.getElementById('guide-' + id)?.scrollIntoView({ block: 'start' });
  return (
    <Page title="Guide">
      <Card title="Contents">
        <div className="chips">{topics.map((t) => <button key={t.id} onClick={() => go(t.id)}>{t.title}</button>)}</div>
      </Card>
      {topics.map((t) => (
        <div key={t.id} id={'guide-' + t.id}>
          <Card title={t.title}>{t.body}</Card>
        </div>
      ))}
    </Page>
  );
}
