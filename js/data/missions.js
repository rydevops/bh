// Daily/weekly missions and the 7-day login calendar (GDD 11.1, 14 live ops - local, no server).
// Rewards use only earnable currencies. There is nothing to buy with real money.

export const DAILY_POOL = [
  { id: 'kills', stat: 'kills', goal: 120, text: 'Defeat 120 enemies', reward: { coins: 150 } },
  { id: 'cuts', stat: 'cuts', goal: 25, text: 'Cut 25 enemy bullets', reward: { gems: 4 } },
  { id: 'wins', stat: 'wins', goal: 2, text: 'Win 2 stages', reward: { coins: 220 } },
  { id: 'abilities', stat: 'abilities', goal: 10, text: 'Use hero abilities 10 times', reward: { coins: 130 } },
  { id: 'crits', stat: 'crits', goal: 60, text: 'Land 60 critical hits', reward: { gems: 3 } },
  { id: 'upgrades', stat: 'upgrades', goal: 8, text: 'Pick 8 upgrades during runs', reward: { coins: 140 } },
  { id: 'bosses', stat: 'bosses', goal: 1, text: 'Defeat a boss', reward: { gems: 6 } },
];

export const WEEKLY_POOL = [
  { id: 'w_wins', stat: 'wins', goal: 10, text: 'Win 10 stages', reward: { tokens: 1, gems: 10 } },
  { id: 'w_kills', stat: 'kills', goal: 1200, text: 'Defeat 1,200 enemies', reward: { gems: 15, coins: 500 } },
  { id: 'w_cuts', stat: 'cuts', goal: 200, text: 'Cut 200 enemy bullets', reward: { tokens: 1 } },
  { id: 'w_bosses', stat: 'bosses', goal: 3, text: 'Defeat 3 bosses', reward: { tokens: 1, gems: 8 } },
];

export const LOGIN_CALENDAR = [
  { coins: 100 },
  { gems: 5 },
  { coins: 200 },
  { tokens: 1 },
  { gems: 10 },
  { coins: 400 },
  { tokens: 2, gems: 20 },
];
