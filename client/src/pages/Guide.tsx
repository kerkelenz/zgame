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
          <li><b>The menu</b> on the left has seven hubs, always all showing: <b>Home</b> (Overview, Empire, Economy, Contracts, Command), <b>Build</b> (Buildings, Research, Shipyard, Defense, Tech tree, Resources, and Automation once it unlocks), <b>Fleet</b>, <b>Galaxy</b>, <b>Inbox</b> (Messages, Chat, Contacts), <b>Alliance</b> (Alliance, Territory, Standing) and <b>More</b> (Settings, this Guide, the <b>release notes</b> page and, for admins, the Admin page). The pages of the hub you are in are tabs along the top of the page, and a hub opens the page you were last on in it. A hub shows a count when something waits there: unread messages in Inbox, rewards to claim in Home, an invasion in Fleet. On a page for one item or commander, a trail under the tabs (Build › Buildings › Metal Mine) shows where you are and takes you back. A few pages appear only when they are useful: <b>Automation</b> once your economy has grown a little, <b>Territory</b> when you are in an alliance, <b>Invasion</b> during a Void invasion (and afterwards, for the record), and the <b>Simulator</b> once you have a shipyard or have fought. <b>Settings</b> can show every page all the time.</li>
          <li><b>The planet bar.</b> Under the top bar every planet is a chip with its picture, name, role and coordinates, and the moon as a smaller part of its planet's chip. Click a chip (or its moon) to work on it: the pages of Home (Overview), Build and Fleet then show that planet. A chip carries small tags for what needs you: an attack on the way with the time left, an idle building queue, the time left on what is being built, a full store, low energy. With more than five planets the bar is one button showing the current planet ("3 of 7") with arrows either side; it opens a list you can search by name or coordinates, with the same tags, and the number keys 1 to 9 jump to the first nine planets. On pages that are not about one planet (Empire, Economy, the Galaxy, Inbox and so on) the bar is dimmed and says so.</li>
          <li><b>Names and coordinates are links.</b> Wherever the game shows a coordinate such as [1:2:3], a commander's name or a planet's name (in the Overview events, the Fleet page, messages, battle and spy reports, the alliance page, chat, the standing and more) you can click it: a coordinate or planet name opens the galaxy at that system, a name opens the commander's profile. Names and coordinates inside message texts, the alliance log, the bulletin board and chat are links too, and so are your own planet names. Dropdown lists are the one place that cannot hold links.</li>
          <li><b>Search players</b> in the top bar finds a commander by part of their name (two letters are enough), also computer empires and, by typing an alliance tag, its members. Pick a result with the mouse or the arrow keys and Enter, and their profile opens. Results start with names that begin with what you typed and put stronger commanders first.</li>
          <li><b>What to do next.</b> The Overview lists what needs you, most urgent first: a building queue or the research sitting idle (💤), a store about to fill or already wasting production, an energy shortage slowing the mines (⚠), and tips such as a contract reward to claim, a free expedition slot, or a planet with no defenses. <b>Go</b> opens the right page on the right planet. A chip in the top bar counts the idle queues and takes you there.</li>
          <li><b>Overview</b> is your planet at a glance with the current <b>objective</b> that teaches the game step by step. <b>Empire</b> shows all your planets together. <b>Economy</b> explains your income.</li>
          <li><b>Resources, Buildings, Research, Shipyard, Defense</b> run the selected planet (pick it in the top bar). <b>Automation</b> does routine work for you and <b>Contracts</b> pays you for the things you do anyway. <b>Fleet</b> and <b>Galaxy</b> are where ships move; <b>Territory</b> shows which alliance holds which system and <b>Invasion</b> is where the whole server fights the Void.</li>
          <li><b>Alliance, Contacts, Messages, Chat, Standing</b> are the social side; <b>Command</b> holds your class, officers, factions and achievements; <b>Settings</b> holds your account, alerts and vacation mode.</li>
          <li>Click <b>any item name</b> (a building, technology, ship or defense, here or in a requirement list) to open its <b>details page</b>: a large picture of the item (buildings, technologies, ships and defenses that have artwork show it at the top, and on cards and in lists as a small icon), a short explanation of what it is for and what is worth knowing, what each level gives, what it costs, and what it unlocks. For a building or technology the next level's change is shown in colour next to each effect: green when it is good news (more output) and red when it is a cost (more energy used, more vespene gas burned, a longer recharge). A ship's page has a <b>Special features</b> box: its rapid fire against other units (green), what has rapid fire against it (red) and an engine change where there is one (amber): the Small Cargo moves to the impulse drive at Impulse Drive 5, and the Bomber to the hyperspace drive at Hyperspace Drive 8, from a base speed of 5,000, with a table of its speed at every level of that drive. The <b>Simulator</b> predicts a battle before you fly it.</li>
          <li><b>The hands-on tutorial.</b> When the welcome tour ends, a short tutorial begins. It dims the page around the real button to press and waits for you to press it: open Buildings, build a Metal Mine, queue a Solar Plant, open an item's details page and go back, then visits Research, the Tech tree, the Galaxy and the Overview. A step moves on by itself the moment you have done it, <b>Skip this step</b> passes one you cannot do yet (for example when you cannot afford it), and <b>Skip tutorial</b> ends it. It remembers where you stopped, per commander and browser. <b>Start the hands-on tutorial</b> in Settings begins it again at any time.</li>
          <li><b>Moving around.</b> Every page, details page, profile and galaxy view is a place in the browser history: the browser's <b>Back</b> and <b>Forward</b> buttons work, a refresh keeps you where you are, and the address can be bookmarked or shared. <b>Ctrl+K</b> opens a jump box: type part of a page, building, research, ship, defense or commander name, or coordinates such as 1:34:7, and press Enter. Without anything typed it lists the keyboard shortcuts: <b>/</b> searches players, <b>[</b> and <b>]</b> (or click a planet in the strip under the top bar) switch to the previous and next planet or moon, and <b>g</b> followed by a letter opens a page (<b>g b</b> Buildings, <b>g f</b> Fleet, <b>g y</b> Galaxy, and so on, all listed in the jump box). Shortcuts never fire while you type in a field. <b>Skip to the page</b> (the first Tab stop) jumps past the menu. On the Tech tree the arrow keys move between cards, Enter or Space selects one, and each card is read out with whether you have it. The game follows your system setting for reduced motion. A level, ship count or bell that goes up glows or shakes for a moment, and pop-ups are announced to screen readers. The <b>bell</b> in the top bar keeps every message the pop-ups showed (completed builds, arrivals, warnings) with <b>Mark all read</b> and <b>Clear</b>. On a phone the hubs are a bar at the bottom: Home, Build, Fleet, Galaxy and Inbox, with <b>More</b> for the Alliance hub, Settings and the rest; the tabs of a hub scroll sideways along the top.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'resources', title: 'Resources, energy and storage',
    body: (
      <ul>
        <li><b><ResIcon k="metal" /> Metal</b> (steel ingots) is the backbone of nearly every building and ship. <b><ResIcon k="crystal" /> Crystal</b> (the blue gem) goes into research, electronics and most ships. <b><ResIcon k="deuterium" /> Vespene Gas</b> (the glowing green canister) fuels your fleets and pays for advanced technology.</li>
        <li><b>Reading the top bar.</b> Point at a resource to see how long until its storage is full. A resource turns amber when it fills within the hour, with the time left beside it, and red with FULL once production is being wasted. A negative energy balance shows the percentage your mines are running at.</li>
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
        <li><b>Finding what you can do.</b> Tick <b>Only what I can start now</b> on Buildings, Research, Shipyard or Defense to hide everything you cannot start. A card you cannot pay for yet says when you can (at this planet's production), or that the cost does not fit the storage. Where a card lists something it needs, an <b>Upgrade</b> or <b>Research</b> button appears next to each requirement you could start right away, and the Tech tree has the same button on the selected card and on the steps of a path.</li>
        <li><b>Undo.</b> Cancelling a job or removing a queued one shows an <b>Undo</b> button for a few seconds. It puts the same job back (a running job starts again from the beginning, a removed one goes to the end of the queue) and is paid for again at the price of that moment.</li>
        <li><b>Queues.</b> Each of buildings and research can queue four jobs behind the running one. A queued job is <b>paid for and reserved the moment you queue it</b> and refunded if you remove it, so it can never fail later for lack of resources. Use the arrows to reorder. If an item is already being upgraded or queued, its card shows the <i>later</i> level and that level's real price; the button only enables when you can afford exactly what you will get. Every queued job shows how long it takes, and under the list is the time of the whole queue including the running job (an estimate at today's levels: a queued Robotics Factory or Research Lab would shorten the jobs behind it). The Shipyard's production queue shows when each row will be done and the total of all rows together.</li>
        <li><b>Demolishing.</b> A building (on a planet or a moon) can be taken down one level at a time with <b>Demolish a level</b> on its card or details page. It takes half the time it took to build that level, uses the planet's build slot (so the building queue has to be empty, and nothing else is built there meanwhile), and gives back about 30% of that level's price when it is done. Cancelling it costs and returns nothing. It frees a building field, so it is the way to make room. Some levels cannot go while they are in use: a Terraformer or Lunar Base level whose extra fields are occupied, a Missile Silo level whose missiles would not fit any more, the Research Lab while research is running, and the Shipyard or Nanite Factory while units are in production.</li>
        <li>Requirements are shown on every card; a requirement you meet turns green. Some buildings are moon-only and some planet-only.</li>
        <li><b>Tech tree.</b> The Tech tree page (a tab under Build) is a map of everything you can build, research or train. Each building, research, ship and defense is one card showing your level (for example Energy Technology, Level 3 / 12). Rows group the cards by purpose (Economy, Research, Fleet, Defense and Moon buildings) and columns are steps left to right, so whatever a card needs sits in a column to its left and is joined to it by a line that runs only up, down or sideways along the gaps between cards, never across one (faint lines come from items that feed many others, such as the Shipyard). Cards you have are green, cards whose requirements you already meet glow because you can start them now, and the rest are dimmed as locked. Click a card to light every step that leads to it and everything it opens, and to open its levels in place: the levels the lit arrows need are ringed. A panel lists the path to get there in order with your progress. <b>Show only the path to</b> any item hides everything else and lays out just what that item needs, with arrows labelled by the level required, ticks on what you have and the steps you can start right now listed first. The map has no scroll bars: drag it with the mouse or a finger to pan, use the wheel or a two-finger pinch to zoom, press Fit all for the whole picture, or use the jump list to find an item. Its second view, <b>Production and effects</b>, lists what raises each output (metal, crystal, vespene gas, energy, construction, research and shipbuilding speed, fleet speed and strength, planets and slots) and what limits it, with your current levels beside each item.</li>
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
        <li><b>Every world has its own picture.</b> A planet's picture is chosen from the looks that suit its temperature (lava, desert and obsidian worlds at the hot positions, ice and barren rock far out, oceans and jungles in between) and a moon's from six moon looks. The choice depends only on the world itself, so a planet or moon keeps its picture for as long as it exists. Pictures show on the Overview and the Empire page.</li>
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
        <li>Use the filters to show only inactive targets or hide protected ones. <b>Bookmark</b> a system with the star, and the Galaxy remembers your recent targets. The 📝 button keeps a private note on a position; notes on commanders show there too.</li>
        <li>Spies are most useful against <b>inactive</b> commanders and empires: they never spend what they hoard. Your latest report on each planet is kept under <b>Contacts</b>. At the top of a spy report the coordinates are a link to the galaxy, and buttons <b>Attack</b>, <b>Spy again</b> and <b>Transport</b> open the Fleet page with that planet already chosen as the target.</li>
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
        <li><b>Raiders</b> attack commanders periodically. You always get at least 10 minutes of warning, and your allies are told too. A raid is sized from what defends the planet it targets (the ships and defenses standing there), roughly 0.6 to 1.3 times its value, with only a small floor from your overall points, so a well-defended planet holds and a neglected one does not. Accounts are raided gently at first, about 30% of full strength in their first day, rising to full over the first week. Defenses and stationed allied fleets turn raids into profit: when raiders are crushed everyone who defended shares a bounty.</li>
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
        <li><b>Choosing an alliance.</b> Without one, the Alliance page lists them with the ones anyone can join first, then the strongest, showing members, how many were active this week, combined points and the systems they hold. The Overview suggests joining once your account is an hour old and some alliance is open.</li>
        <li><b>Activity.</b> The Activity card is the alliance feed: members attacked, attacks they made, raids on them, help they asked for and defenders who answered, and buildings and research that reached a milestone (every fifth level, or the first Research Lab, Shipyard, Space Dock, Jump Gate, Terraformer and Nanite Factory). A filter narrows it to one kind.</li>
        <li><b>Asking for help.</b> When a hostile fleet is heading for your planet, the Fleet page offers <b>Ask allies for help</b> next to it (once per fleet): every other member gets an alert, as for a raid on an ally, with where and when, and the feed gets a line. Then send a Defend ally (hold) fleet.</li>
        <li><b>Operations.</b> The Operations card is a shared target board. Anyone can plan an attack, or a defense with hold fleets, on a target, with a landing time if you want one (between five minutes and a week away; six can be open at once). Members sign up with the warships, or every ship, of one of their planets; the board shows each flight time and, with a landing time, when each must leave to land together, and everyone gets an alert ten minutes before. <b>Prepare launch</b> fills in the Fleet page with the target, mission and ships. Nothing is launched or reserved for you. The planner or an officer closes an operation, and a landed one closes itself.</li>
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

const ADMIN: Topic = {
  id: 'admin', title: 'Admin tools',
  body: (
    <ul>
      <li><b>Server health</b> at the top of the Admin page, refreshed every five seconds: how long the server has been up, how long a tick takes (average, 95% under, slowest; it turns red when ticks are slow), the last save with its time and size, memory, how many commanders are online now, today and this week and how many live connections there are, the size of the world, and the last twenty errors.</li>
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
