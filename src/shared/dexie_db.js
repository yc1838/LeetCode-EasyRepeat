/**
 * Dexie Database Instance
 * 
 * Provides IndexedDB wrapper for the Neural Retention Agent.
 * Used for storing submission logs that will be analyzed nightly.
 */

import Dexie from 'dexie';

// Create database instance
const db = new Dexie('NeuralRetentionDB');

// Define schema
db.version(1).stores({
    // submissionLog: Primary table for all submissions
    // ++id = auto-incrementing primary key
    // sessionId = index for grouping by day
    // problemSlug = index for querying by problem
    // timestamp = index for time-based queries
    // result = index for filtering by outcome
    submissionLog: '++id, sessionId, problemSlug, timestamp, result, submissionId',

    // attemptCounter: Track attempt numbers per problem per session
    // Compound key: [sessionId, problemSlug]
    attemptCounter: '[sessionId+problemSlug], count',

    // skillSnapshots: Daily skill DNA snapshots for trend analysis
    skillSnapshots: '++id, date'
});

export default db;
