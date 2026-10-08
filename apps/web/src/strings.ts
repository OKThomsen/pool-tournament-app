/**
 * Every UI string, in Danish and English. Components use `t`, which always points at the current
 * language; `LanguageProvider` switches it and re-renders the app.
 *
 * Danish labels from the wireframes are kept as they are (Turneringer, Spillere, Sæson
 * Leaderboard …). Add every new string to both languages: `en` must have the same shape as `da`.
 */
const da = {
  brand: "Frank's Poolhouse",
  language: { switchTo: 'English', code: 'EN' },
  nav: {
    tournaments: 'Turneringer',
    players: 'Spillere',
    season: 'Sæson',
    newTournament: 'Ny Turnering',
    login: 'Log ind',
    logout: 'Log ud',
  },
  frontpage: {
    title: "Frank's Poolhouse turnerings platform",
    leaderboard: 'Sæson Leaderboard',
  },
  tournaments: {
    title: 'Turneringer',
    one: 'Turnering',
    date: 'Dato',
    winner: 'Vinder',
    participants: 'Antal deltagere',
    format: 'Format',
    none: 'Ingen afsluttede turneringer endnu.',
  },
  detail: {
    inProgress: 'Turneringen er i gang.',
    followLive: 'Følg den live',
    placings: 'Placeringer',
    placement: 'Placering',
    points: 'Point',
    poolWins: 'Vundne puljekampe',
    correctHelp:
      'Klik på et resultat for at rette det; placeringer og point opdateres med det samme. Større ændringer kræver, at turneringen genåbnes.',
    reopen: 'Genåbn turnering',
    confirmReopen:
      'Genåbn turneringen? Den går tilbage til slutspillet, og dens point fjernes, indtil den afsluttes igen.',
    needsReopen:
      'Den rettelse ville ændre, hvem der gik videre eller mødte hinanden senere. Genåbn turneringen for at lave den.',
    otherInProgress: 'Der er en anden turnering i gang. Afslut den først.',
  },
  placements: {
    '1st': '1.',
    '2nd': '2.',
    '3rd': '3.',
    '4th': '4.',
    '5-8': '5.–8.',
    participation: 'Deltager',
  },
  players: {
    title: 'Spillere',
    name: 'Navn',
    baseHandicap: 'Handicap',
    frameHandicap: 'Frame-handicap',
    seasonPoints: 'Sæsonpoint',
    participation: 'Deltagelse',
    wins: 'Sejre',
    semifinals: 'Semifinaler',
    quarterfinals: 'Kvartfinaler',
    member: 'Medlem',
    memberThisSeason: 'Medlem denne sæson',
    none: 'Ingen spillere endnu.',
    edit: 'Rediger',
    delete: 'Slet',
    confirmDelete: (name: string) => `Er du sikker på at du vil slette ${name}?`,
    nameTaken: 'Der findes allerede en spiller med det navn.',
    hasTournaments: 'Spilleren har spillet turneringer og kan ikke slettes.',
  },
  season: {
    title: 'Sæson',
    empty: 'Ingen har spillet i denne sæson endnu.',
  },
  login: {
    title: 'Log ind',
    username: 'Brugernavn',
    password: 'Adgangskode',
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
    cancel: 'Annuller',
    remove: 'Fjern',
    noMatch: 'Ingen spillere fundet',
    count: (n: number) => (n === 1 ? '1 spiller' : `${n} spillere`),
    pools: (sizes: number[]) => `Puljer: ${sizes.join(' + ')}`,
    tooFew: 'Der skal mindst være 4 spillere',
    alreadyRunning: 'Der er allerede en turnering i gang. Afslut eller annuller den først.',
    goToRunning: 'Gå til turneringen',
  },
  stages: {
    pools: 'Indledende puljer',
    quarterfinals: 'Kvartfinaler',
    semifinals: 'Semifinaler',
    thirdPlace: 'Bronzekamp',
    final: 'Finale',
  },
  ongoing: {
    finalizeBrackets: 'Lås puljerne',
    completeQualifiers: 'Afslut puljespillet',
    concludeTournament: 'Afslut turneringen',
    upNext: 'Næste kampe',
    week: 'Uge',
    cancelTournament: 'Annuller turnering',
    confirmStart: 'Er puljerne klar? Bagefter kan de ikke ændres.',
    confirmCancel: 'Er du sikker på at du vil annullere turneringen? Den bliver slettet.',
    confirmConclude:
      'Afslut turneringen? Placeringer og point gemmes, og den kommer på listen over turneringer.',
  },
  pools: {
    pool: 'Pulje',
    dragHelp:
      'Træk en spiller over på en anden for at bytte dem, eller ind i en anden pulje for at flytte spilleren.',
    tooSmall: 'En pulje skal have mindst 2 spillere.',
    setScore: 'Sætscore',
    won: 'Vundne',
    tied: 'Står lige. Admin vælger rækkefølgen, når kvalifikationen afgøres.',
    sittingOut: 'Sidder over',
    complete: 'Alle kampe i puljen er spillet.',
    allComplete: 'Alle puljekampe er spillet. Næste trin: Afslut puljespillet.',
  },
  score: {
    raceTo: (n: number) => `Først til ${n}`,
    clear: 'Ryd resultat',
  },
  qualify: {
    knockout: 'Slutspil',
    quarterfinals: 'Kvartfinaler (8)',
    semifinals: 'Semifinaler (4)',
    raceTo: 'Først til',
    cannot: 'Der er ikke spillere nok til det valgte slutspil.',
    qualifiers: (n: number) => `Disse ${n} går videre:`,
    tie: (players: string) => `Står lige: ${players}`,
    pickOrder: 'Klik spillerne i rækkefølge, bedste først.',
    startOver: 'Start forfra',
    tiesLeft: 'Der er stadig spillere, der står lige. Vælg rækkefølgen først.',
    confirm: (round: string, raceTo: number) =>
      `Start slutspillet med ${round}, først til ${raceTo}? Puljeresultater kan derefter kun rettes, hvis det ikke ændrer, hvem der går videre.`,
  },
  knockout: {
    title: 'Slutspil',
    waiting: 'Venter …',
    seed: (n: number) => `Seedet som nr. ${n}`,
    laterPlayed:
      'Det ville ændre, hvem der spiller en senere kamp, som allerede har et resultat. Ryd den kamps resultat først.',
    done: 'Finalen og bronzekampen er spillet. Næste trin: Afslut turneringen.',
  },
  live: {
    drawing: 'Puljerne bliver lavet …',
    noTournament: 'Ingen turnering i gang lige nu',
  },
  yes: 'Ja',
  no: 'Nej',
  save: 'Gem',
  cancel: 'Annuller',
  loading: 'Indlæser…',
  loadFailed: 'Kunne ikke hente data. Prøv igen.',
  saveFailed: 'Kunne ikke gemme. Prøv igen.',
  notFound: 'Siden findes ikke',
  placeholder: 'Kommer snart',
};

export type Strings = typeof da;

const en: Strings = {
  brand: "Frank's Poolhouse",
  language: { switchTo: 'Dansk', code: 'DA' },
  nav: {
    tournaments: 'Tournaments',
    players: 'Players',
    season: 'Season',
    newTournament: 'New tournament',
    login: 'Log in',
    logout: 'Log out',
  },
  frontpage: {
    title: "Frank's Poolhouse tournament platform",
    leaderboard: 'Season leaderboard',
  },
  tournaments: {
    title: 'Tournaments',
    one: 'Tournament',
    date: 'Date',
    winner: 'Winner',
    participants: 'Players',
    format: 'Format',
    none: 'No finished tournaments yet.',
  },
  detail: {
    inProgress: 'This tournament is in progress.',
    followLive: 'Follow it live',
    placings: 'Placings',
    placement: 'Place',
    points: 'Points',
    poolWins: 'Pool matches won',
    correctHelp:
      'Click a result to correct it; placings and points update at once. Bigger changes need the tournament reopened.',
    reopen: 'Reopen tournament',
    confirmReopen:
      'Reopen the tournament? It goes back to the knockout and its points are removed until it is concluded again.',
    needsReopen:
      'That correction would change who went through or who met later. Reopen the tournament to make it.',
    otherInProgress: 'Another tournament is in progress. Finish it first.',
  },
  placements: {
    '1st': '1st',
    '2nd': '2nd',
    '3rd': '3rd',
    '4th': '4th',
    '5-8': '5th–8th',
    participation: 'Participant',
  },
  players: {
    title: 'Players',
    name: 'Name',
    baseHandicap: 'Handicap',
    frameHandicap: 'Frame handicap',
    seasonPoints: 'Season points',
    participation: 'Tournaments',
    wins: 'Wins',
    semifinals: 'Semifinals',
    quarterfinals: 'Quarterfinals',
    member: 'Member',
    memberThisSeason: 'Member this season',
    none: 'No players yet.',
    edit: 'Edit',
    delete: 'Delete',
    confirmDelete: (name: string) => `Are you sure you want to delete ${name}?`,
    nameTaken: 'There is already a player with that name.',
    hasTournaments: 'This player has played in tournaments and can’t be deleted.',
  },
  season: {
    title: 'Season',
    empty: 'Nobody has played this season yet.',
  },
  login: {
    title: 'Log in',
    username: 'Username',
    password: 'Password',
    submit: 'Log in',
    cancel: 'Cancel',
    wrongCredentials: 'Wrong username or password',
    tooManyAttempts: 'Too many attempts. Try again in a while.',
    failed: 'Login failed. Try again.',
  },
  logout: {
    confirm: 'Are you sure you want to log out?',
    yes: 'Log out',
    cancel: 'Cancel',
  },
  create: {
    addPlayer: 'Add player',
    addNewPlayer: 'Add new player',
    finish: 'Done',
    cancel: 'Cancel',
    remove: 'Remove',
    noMatch: 'No players found',
    count: (n: number) => (n === 1 ? '1 player' : `${n} players`),
    pools: (sizes: number[]) => `Pools: ${sizes.join(' + ')}`,
    tooFew: 'You need at least 4 players',
    alreadyRunning: 'A tournament is already in progress. Finish or cancel it first.',
    goToRunning: 'Go to the tournament',
  },
  stages: {
    pools: 'Preliminary pools',
    quarterfinals: 'Quarterfinals',
    semifinals: 'Semifinals',
    thirdPlace: 'Third place final',
    final: 'Final',
  },
  ongoing: {
    finalizeBrackets: 'Finalize brackets',
    completeQualifiers: 'Complete qualifier brackets',
    concludeTournament: 'Conclude tournament',
    upNext: 'Up next',
    week: 'Week',
    cancelTournament: 'Cancel tournament',
    confirmStart: 'Are the pools ready? They can’t be changed afterwards.',
    confirmCancel: 'Are you sure you want to cancel the tournament? It will be deleted.',
    confirmConclude:
      'Conclude the tournament? Placings and points are saved and it goes on the list of tournaments.',
  },
  pools: {
    pool: 'Pool',
    dragHelp:
      'Drag a player onto another to swap them, or into another pool to move the player there.',
    tooSmall: 'A pool needs at least 2 players.',
    setScore: 'Set score',
    won: 'Won',
    tied: 'Tied. The admin picks the order when qualification is decided.',
    sittingOut: 'Sitting out',
    complete: 'Every match in this pool has been played.',
    allComplete: 'Every pool match has been played. Next step: Complete qualifier brackets.',
  },
  score: {
    raceTo: (n: number) => `Race to ${n}`,
    clear: 'Clear result',
  },
  qualify: {
    knockout: 'Knockout',
    quarterfinals: 'Quarterfinals (8)',
    semifinals: 'Semifinals (4)',
    raceTo: 'Race to',
    cannot: 'There aren’t enough players for that knockout.',
    qualifiers: (n: number) => `These ${n} go through:`,
    tie: (players: string) => `Tied: ${players}`,
    pickOrder: 'Click the players in order, best first.',
    startOver: 'Start over',
    tiesLeft: 'Some players are still tied. Pick their order first.',
    confirm: (round: string, raceTo: number) =>
      `Start the knockout with ${round}, race to ${raceTo}? After that, pool results can only be corrected if it doesn’t change who goes through.`,
  },
  knockout: {
    title: 'Knockout',
    waiting: 'Waiting …',
    seed: (n: number) => `Seed ${n}`,
    laterPlayed:
      'That would change who plays a later match that already has a result. Clear that match’s result first.',
    done: 'The final and the third place final have been played. Next step: Conclude tournament.',
  },
  live: {
    drawing: 'Drawing the pools …',
    noTournament: 'No tournament in progress right now',
  },
  yes: 'Yes',
  no: 'No',
  save: 'Save',
  cancel: 'Cancel',
  loading: 'Loading…',
  loadFailed: 'Couldn’t load the data. Try again.',
  saveFailed: 'Couldn’t save. Try again.',
  notFound: 'Page not found',
  placeholder: 'Coming soon',
};

export type Language = 'da' | 'en';
export const LANGUAGES: Record<Language, Strings> = { da, en };

/**
 * The strings for the current language. A live binding: after `setLanguage`, every module that
 * imported `t` sees the new language (LanguageProvider then re-renders the app).
 */
export let t: Strings = da;

export function setLanguage(language: Language): void {
  t = LANGUAGES[language];
}
