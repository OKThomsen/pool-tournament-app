/**
 * Every UI string in one place, so wording and language can be changed consistently.
 *
 * Danish labels come from the wireframes. The English stage and button names come from the spec
 * and are kept as-is until the UI language is decided (CLAUDE.md, open question 7).
 */
export const t = {
  brand: "Frank's Poolhouse",
  nav: {
    tournaments: 'Turneringer',
    players: 'Spillere',
    newTournament: 'Ny Turnering',
    login: 'Log ind',
    logout: 'Logout',
  },
  frontpage: {
    title: "Frank's Poolhouse turnerings platform",
    leaderboard: 'Sæson Leaderboard',
  },
  tournaments: {
    title: 'Turneringer',
    date: 'Dato',
    winner: 'Vinder',
    participants: 'Antal deltagere',
    format: 'Format',
  },
  players: {
    title: 'Spillere',
    name: 'Navn',
    handicap: 'Handicap',
    seasonPoints: 'Sæsonpoint',
    participation: 'Deltagelse',
    wins: 'Wins',
    semifinals: 'Semifinals',
    quarterfinals: 'Quarterfinals',
    member: 'Medlem',
  },
  login: {
    title: 'Login',
    username: 'Username',
    password: 'Password',
    submit: 'Log ind',
    cancel: 'Annuller',
    wrongCredentials: 'Forkert brugernavn eller adgangskode',
    tooManyAttempts: 'For mange forsøg. Prøv igen om lidt.',
    failed: 'Login mislykkedes. Prøv igen.',
  },
  logout: {
    confirm: 'Er du sikker på at du vil logge ud?',
    yes: 'Log ud',
    cancel: 'Annuller',
  },
  create: {
    addPlayer: 'Tilføj spiller',
    addNewPlayer: 'Tilføj ny spiller',
    finish: 'Færdiggør',
    cancel: 'Cancel',
  },
  stages: {
    pools: 'Preliminary pools',
    quarterfinals: 'Quarterfinals',
    semifinals: 'Semifinals',
    thirdPlace: 'Third place finals',
    final: 'Finals',
  },
  ongoing: {
    finalizeBrackets: 'finalize brackets',
    completeQualifiers: 'complete qualifier brackets',
    concludeTournament: 'conclude tournament',
    upNext: 'Up next',
  },
  notFound: 'Siden findes ikke',
  placeholder: 'Kommer snart',
};
