import { sql } from 'drizzle-orm';
import {
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

/** Calendar quarters, labelled 01/YYYY to 04/YYYY (see seasonForDate in @franks/core). */
export const seasons = pgTable('seasons', {
  id: serial('id').primaryKey(),
  label: text('label').notNull().unique(),
});

/**
 * A player renewed their membership for a season, worth the member bonus in that season. The
 * player's "Medlem" yes/no is whether they have a membership for the current season.
 */
export const memberships = pgTable(
  'memberships',
  {
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    seasonId: integer('season_id')
      .notNull()
      .references(() => seasons.id),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.seasonId] })],
);

export const tournaments = pgTable(
  'tournaments',
  {
    id: serial('id').primaryKey(),
    date: date('date').notNull(),
    seasonId: integer('season_id')
      .notNull()
      .references(() => seasons.id),
    week: integer('week').notNull(),
    format: gameFormat('format').notNull(),
    /** 4 (semifinals) or 8 (quarterfinals); chosen when the pools are complete. */
    knockoutSize: integer('knockout_size'),
    status: tournamentStatus('status').notNull().default('draft'),
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
  },
  (t) => [primaryKey({ columns: [t.tournamentId, t.playerId] })],
);

export const pools = pgTable(
  'pools',
  {
    id: serial('id').primaryKey(),
    tournamentId: integer('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    /** A, B, C … */
    name: text('name').notNull(),
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
    /** Knockout slot: QF1–QF4, SF1, SF2, THIRD, FINAL. Null for pool matches. */
    slot: text('slot'),
    playerAId: integer('player_a_id').references(() => players.id),
    playerBId: integer('player_b_id').references(() => players.id),
    /**
     * Frames needed to win. Pool matches are race to 2; the admin chooses for the knockout and
     * can change it per match (for example a longer final).
     */
    raceTo: integer('race_to').notNull().default(2),
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
