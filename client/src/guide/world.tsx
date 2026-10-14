import type { Topic } from './types';

/** The wider game: the economy, computer empires, command, alliances and Void invasions */
export const WORLD: Topic[] = [
  {
    id: 'economy', title: 'Growing your economy',
    body: (
      <ul>
        <li>The <b>Economy</b> page shows where income comes from (mines, technology, orbit, crawlers, bonuses, energy losses), when your stores fill, and ranks upgrades by how fast they pay for themselves.</li>
        <li>The <b>travelling merchant</b> (Resources page) swaps resources at 3 metal : 2 crystal : 1 Vespene Gas and keeps a 12% cut (8% for Collectors). Each day he also offers one trade at only a 2% cut, up to a daily allowance - the page shows today's deal and when it resets.</li>
        <li>The <b>Market</b> (a tab in Home) swaps resources with other commanders. <b>Offer</b> an amount of one resource for an amount of another: the goods leave your selected planet at once and are held for the offer, and they come back if you cancel or if nobody takes the offer within the time shown. Your price must stay within a band around the fair rate (the merchant's rate, 3 metal : 2 crystal : 1 Vespene Gas), so nobody can pass goods to another account for free. Anyone can take an open offer whole with <b>Take</b>, paying from the planet they have selected, and receives the goods minus the market's cut (shown in the <i>Gets you</i> column); you are paid on the planet the goods came from and told by message. In an alliance you can offer to your alliance only, which carries no cut. Everyone may have a limited number of open offers. At the fair rate the market is cheaper than the merchant.</li>
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
    id: 'encounters', title: 'Events at your planets',
    body: (
      <ul>
        <li>While you play, something now and then turns up at one of your planets: roughly every 20 to 40 minutes of play, and only for you. A card appears in the <b>notice strip</b> with a countdown (it fades after 10 to 20 minutes if you do nothing) and a pop-up tells you. Click the card to read it and choose. Nothing happens while the game is closed or you are away, and one event waits at a time.</li>
        <li><b>Distress signal.</b> A freighter asks for a tow. <b>Send a rescue</b> costs some Vespene Gas for fuel and usually pays a good haul of metal and crystal and 5 Command Credits; one call in four is bait and only costs you the fuel. With an Espionage Probe at that planet you can <b>scan</b> it first to find out which.</li>
        <li><b>Wandering trader.</b> A one-off deal at a better rate than the travelling merchant's. <b>Haggle</b> is a coin flip: a much better rate, or he leaves.</li>
        <li><b>Strange signal.</b> <b>Study</b> it for a data cache (Command Credits), a crystal-rich fragment, or now and then a small repair bill.</li>
        <li><b>Pirate patrol.</b> <b>Pay the toll</b> (some metal and crystal) or <b>fight</b>: your ships and defenses at that planet meet a patrol worth about half of them, and a win brings the wreckage as loot, a loss costs the losses and a share of the stock. A planet with nothing to fight with can only pay.</li>
        <li><b>Lucky finds</b> (a meteor field, a crystal vein) are yours for the taking. Every reward is an hour or two of that planet's production, so events are a pleasant bonus and never decide anything. The result of each one is kept in your messages.</li>
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
        <li><b>The campaign.</b> Every few days the Void tears open a <b>rift</b> in deep space. Everyone is told hours ahead (a bar across the top and a message) with the rift's coordinates, and that is the time to scout, build and gather your alliance. When the rift opens the aliens come through in <b>waves</b> (four by default): <b>Scouts</b>, then <b>Assaults</b>, then the <b>Mothership</b>. Each wave is bigger than the one before and the whole invasion is a bit over a third of all the combat fleets on the server when it was announced (fleets built later are extra). A wave arrives on its schedule, or sooner (about twenty minutes after) when you destroy the one before; ships left over join the next wave. Destroy the Mothership to win. If the time runs out first the aliens withdraw.</li>
        <li><b>Kinds of aliens.</b> Every wave is one kind, made of ordinary combat ships with a twist. <b>Swarms</b> are many light ships: cruisers have rapid fire against them. <b>Shield-breakers</b> hit hard with weak shields: armour and speed of the kill matter. <b>Bio-ships</b> regrow 15% of their fleet before every engagement, so only a united blow works. <b>Carriers</b> have enormous armour and strong shields: weapons and heavy guns count. The <b>Mothership</b> is everything at once. The Invasion page tells you each kind's weakness once the wave has come or been scouted.</li>
        <li><b>The front.</b> Send combat fleets with the mission <b>Join the invasion front</b> (on the Fleet page, or from the button on the Invasion page). A fleet that reaches the rift waits there. Every 30 minutes <b>every fleet at the rift fights what is on the field as one force</b>, in a normal six-round battle with your technologies. Survivors stay for the next engagement until you <b>recall</b> them or the event ends. A fleet weaker than the wave is destroyed, though it still does damage (roughly 15% of the wave at half its strength, 30% at four fifths, half at equal strength), so coordinate: agree a time, arrive together, and bring enough. Between waves the field is empty and nothing is fought. Each engagement can be watched as a replay on the Invasion page.</li>
        <li><b>Strike teams at home.</b> Each time a wave arrives, aliens also head for planets. Every active commander past newbie protection (and not on vacation) has an even chance of being hit on one of their worlds. A strike team is sized like a raid from what defends that planet (more in later waves, gentler for new accounts) and arrives after a warning of at least fifteen minutes. It is a normal battle: defenses are mostly rebuilt, ships can be lost, and destroyed aliens leave debris to recycle. Allies can send a <b>Defend ally (hold)</b> fleet, and <b>Ask allies for help</b> on the Fleet page tells them. Strike teams still on the way when the invasion ends turn back.</li>
        <li><b>Scouting.</b> Send Espionage Probes with the mission <b>Scout the Void rift</b>, even before the rift opens. They look at the next wave (the one on the field when all have come) and tell everyone on the Invasion page: its kind, about how big it is, and how to fight it. Ten or more probes show the exact fleet. The probes fly home. The first look at a wave and the first exact look each count as scouting work.</li>
        <li><b>Supply convoys.</b> Send cargo ships loaded with resources on the mission <b>Supply convoy to the front</b>. They join the supplies at the rift, and the ships fly home empty. Before every engagement the supplies rebuild the ships lost in the last one, at half their price, for the commanders whose fleets are still at the front, biggest losses first. From the first wave on, an alien patrol can catch a convoy (10% at first, more with each wave): it loses 30% of its ships and cargo, but the rest still gets through. Warships travelling with the convoy cut the risk by up to 80%.</li>
        <li><b>Rewards.</b> Everyone's work counts. A pool of Command Credits (600 plus 100 per participant, up to 3,000) is split by work: 50% by damage at the front, 20% by the value of aliens destroyed at home, 20% by the value of supplies delivered and 10% by scouting reports; a job nobody did does not count, and its weight goes to the others. Anyone who helped gets at least 25, and anyone with a real share earns <b>Void Slayer</b> when the invasion is destroyed. A share of the ships you lost at the front (15%) also comes back as resources on your first planet. If the aliens withdraw, a third of the pool is shared and the ship relief is halved. Further achievements: <b>Void Guardian</b> (destroy a million resources of strike teams at home), <b>Void Quartermaster</b> (deliver half a million resources of supplies) and <b>Void Scout</b> (scout the rift three times). The top commanders and alliances are listed per job on the Invasion page.</li>
        <li>You receive one rolling report per round at the front (it replaces the previous one) with the round-by-round battle, a message for every strike team you fight, and a final message with your work and credits.</li>
      </ul>
    ),
  },
];
