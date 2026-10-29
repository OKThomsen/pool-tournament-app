import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const gameFormat = pgEnum('game_format', ['8-ball', '9-ball', '10-ball']);
export const tournamentStatus = pgEnum('tournament_status', [
  'draft',
  'pools',
  'knockout',
  'concluded',
]);
export const matchStage = pgEnum('match_stage', ['pool', 'QF', 'SF', 'THIRD', 'FINAL']);
export const placement = pgEnum('placement', ['1st', '2nd', '3rd', '4th', '5-8', 'participation']);

export const players = pgTable(
  'players',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    baseHandicap: integer('base_handicap').notNull().default(0),
    frameHandicap: integer('frame_handicap').notNull().default(0),
    lastAdjusted: date('last_adjusted'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // Names are unique regardless of case, so the player search never shows two identical names.
  (t) => [uniqueIndex('players_name_lower_idx').on(sql`lower(${t.name})`)],
);

/**
 * A stretch of time a player was a member, from `start` to `end` (both included). `end` is null
 * while the membership is active; a player has at most one active membership. Membership runs
 * all year, but only earns the season's member bonus if it covers the season (earnsMemberBonus
 * in @franks/core).
 */
export const memberships = pgTable(
  'membership_periods',
  {
    id: serial('id').primaryKey(),
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    start: date('start').notNull(),
    end: date('end'),
  },
  (t) => [
    uniqueIndex('membership_periods_one_active_idx')
      .on(t.playerId)
      .where(sql`"end" is null`),
    check('membership_periods_end_after_start', sql`"end" is null or "end" >= "start"`),
  ],
);

/** A tournament's season follows from its date (seasonForDate in @franks/core). */
export const tournaments = pgTable(
  'tournaments',
  {
    id: serial('id').primaryKey(),
    date: date('date').notNull(),
    week: integer('week').notNull(),
    format: gameFormat('format').notNull(),
    /** 4 (semifinals) or 8 (quarterfinals); chosen when the pools are complete. */
    knockoutSize: integer('knockout_size'),
    status: tournamentStatus('status').notNull().default('draft'),
    /**
     * An old tournament entered afterwards ("Indtast gammel turnering"): only its placings are
     * known, so it has no pools, matches or seeds and is concluded from the start.
     */
    historical: boolean('historical').notNull().default(false),
    /**
     * "For sjov kamp": played and saved like any other tournament, but left out of every
     * statistic (season points, Deltagelse, wins, semifinals, quarterfinals).
     */
    forFun: boolean('for_fun').notNull().default(false),
    /**
     * "Par turnering": teams of two play instead of single players. A team is entered as its
     * first player (`tournament_players.partner_id` is the second) and plays, scores and places
     * as one. Both players get a result, but only participation counts: every team gets the
     * participation points, and wins, semifinals, quarterfinals and handicap regulation leave
     * the tournament out.
     */
    duo: boolean('duo').notNull().default(false),
    /**
     * The 6-digit code players enter on /play to score matches. Only admins see it. Null once
     * the tournament is concluded.
     */
    joinCode: text('join_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    concludedAt: timestamp('concluded_at', { withTimezone: true }),
  },
  // At most one tournament in progress (not concluded) at a time.
  () => [
    uniqueIndex('tournaments_one_in_progress_idx')
      .on(sql`(true)`)
      .where(sql`status <> 'concluded'`),
  ],
);

export const tournamentPlayers = pgTable(
  'tournament_players',
  {
    tournamentId: integer('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id),
    /**
     * In a "Par turnering", the team's second player. The team goes by `player_id` everywhere
     * else (pools, matches, seeds). Null otherwise.
     */
    partnerId: integer('partner_id').references(() => players.id),
  },
  (t) => [
    primaryKey({ columns: [t.tournamentId, t.playerId] }),
    uniqueIndex('tournament_players_partner_idx').on(t.tournamentId, t.partnerId),
  ],
);

export const pools = pgTable(
  'pools',
  {
    id: serial('id').primaryKey(),
    tournamentId: integer('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    /** A, B, C â€¦ */
    name: text('name').notNull(),
    /** Frames to win this pool's matches (2 to 5), chosen per pool by the admin. */
    raceTo: integer('race_to').notNull().default(2),
  },
  (t) => [unique().on(t.tournamentId, t.name)],
);

export const poolMembers = pgTable(
  'pool_members',
  {
    poolId: integer('pool_id')
      .notNull()
      .references(() => pools.id, { onDelete: 'cascade' }),
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id),
    position: integer('position').notNull(),
    /**
     * The admin's order for a tie that wins, set score and head-to-head can't break.
     * Lower ranks higher. Null when the admin hasn't had to choose.
     */
    adminTiebreak: integer('admin_tiebreak'),
  },
  (t) => [primaryKey({ columns: [t.poolId, t.playerId] })],
);

/** Knockout seeds, best first. The bracket itself is derived from these and the scores. */
export const knockoutSeeds = pgTable(
  'knockout_seeds',
  {
    tournamentId: integer('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    seed: integer('seed').notNull(),
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id),
  },
  (t) => [primaryKey({ columns: [t.tournamentId, t.seed] })],
);

/**
 * Every match, pool and knockout. Only raw frame scores are stored; wins, set scores, rankings
 * and seeding are derived from them by @franks/core.
 */
export const matches = pgTable(
  'matches',
  {
    id: serial('id').primaryKey(),
    tournamentId: integer('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    stage: matchStage('stage').notNull(),
    poolId: integer('pool_id').references(() => pools.id, { onDelete: 'cascade' }),
    /** Knockout slot: QF1â€“QF4, SF1, SF2, THIRD, FINAL. Null for pool matches. */
    slot: text('slot'),
    playerAId: integer('player_a_id').references(() => players.id),
    playerBId: integer('player_b_id').references(() => players.id),
    /**
     * Frames needed to win. Pool matches are race to 2. In the knockout the admin chooses it per
     * round: the first round when the pools are complete, each later round (the third-place
     * final and the final separately) once its players are known. Null until chosen; the match
     * can't be scored before.
     */
    raceTo: integer('race_to').default(2),
    framesA: integer('frames_a'),
    framesB: integer('frames_b'),
    /** Position in the pool's play order (drives the "up next" panel). */
    scheduleOrder: integer('schedule_order'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('matches_tournament_idx').on(t.tournamentId), unique().on(t.tournamentId, t.slot)],
);

/** Written when a tournament is concluded; recomputed when an admin corrects a result. */
export const results = pgTable(
  'results',
  {
    tournamentId: integer('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id),
    placement: placement('placement').notNull(),
    points: integer('points').notNull(),
    matchesWon: integer('matches_won').notNull(),
    baseHandicap: integer('base_handicap').notNull(),
    frameHandicap: integer('frame_handicap').notNull(),
  },
  (t) => [primaryKey({ columns: [t.tournamentId, t.playerId] })],
);

export const handicapAdjustmentKind = pgEnum('handicap_adjustment_kind', [
  'manual',
  'applied',
  'dismissed',
  'set',
]);

/**
 * Everything that sets a player's handicap regulation score back to 0 (`regulation` in
 * @franks/core): the admin applied or dismissed the recommendation from `tournament_id`, or
 * changed the handicap by hand ('manual'); or that sets it to `score` ('set', by hand, as it
 * stood on `date`). The score itself is replayed from the results.
 */
export const handicapAdjustments = pgTable(
  'handicap_adjustments',
  {
    id: serial('id').primaryKey(),
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    kind: handicapAdjustmentKind('kind').notNull(),
    /** The tournament whose recommendation was resolved; null for a change by hand. */
    tournamentId: integer('tournament_id').references(() => tournaments.id, {
      onDelete: 'set null',
    }),
    /** The day in Denmark it was made; for 'set', the day the score applies from. */
    date: date('date').notNull(),
    /** The score set by hand (−1, 0 or 1), for 'set' only. */
    score: integer('score'),
    oldBase: integer('old_base').notNull(),
    oldFrame: integer('old_frame').notNull(),
    newBase: integer('new_base').notNull(),
    newFrame: integer('new_frame').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('handicap_adjustments_player_idx').on(t.playerId)],
);

/** Season points per placement. Seeded from the workbook's Points System sheet. */
export const pointsTable = pgTable('points_table', {
  placement: placement('placement').primaryKey(),
  points: integer('points').notNull(),
});

export const admins = pgTable('admins', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  /** SHA-256 of the session token; the token itself only lives in the cookie. */
  id: text('id').primaryKey(),
  adminId: integer('admin_id')
    .notNull()
    .references(() => admins.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

/**
 * A player who entered a tournament's join code on /play and may score its matches. Ends when an
 * admin makes a new code, or the tournament is concluded or cancelled.
 */
export const playerSessions = pgTable('player_sessions', {
  /** SHA-256 of the session token; the token itself only lives in the cookie. */
  id: text('id').primaryKey(),
  tournamentId: integer('tournament_id')
    .notNull()
    .references(() => tournaments.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

/** An event on the frontpage's calendar ("Kalender"): a date and the admin's message. */
export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: serial('id').primaryKey(),
    date: date('date').notNull(),
    message: text('message').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('calendar_events_date_idx').on(t.date)],
);
