# DFOP — Davao Football Open Play (Matchday Team Maker & Stats Tracker)

## Overview
**Davao Football Open Play (DFOP)** (`dfop.breindel.me`) is the official matchday session organizer, dynamic team balancer, live pitch tracker, and all-time player statistics hub for the Davao Football Open Play community.

## Users & Roles
1. **Players / Open Play Participants (Unauthenticated Public Access)**
   - View live Open Play status from their phones pitch-side (auto-polling every 12 seconds).
   - Inspect current game lineups (Team A vs Team B), tactical positions (GK, DEF, MID, FWD), and bench rotation queue.
   - Track live match scores, completed games in the current session, and session standings.
   - Browse the all-time Davao Football Open Play Leaderboard, Best Player rankings (Performance Index, Win Points, MVP awards, Goals, Assists, Games Played, Win Rate), and past session archives.
2. **Session Admin (Authenticated via Amazon Cognito)**
   - Upload Open Play session participant CSV (`Name, Skill, Preferred Position`) with automatic returning-player normalization and fuzzy-match alerts.
   - Manage live participant attendance (mark late arrivals/early departures, add walk-in players).
   - Run the dynamic Team Maker for **7-a-side**, **9-a-side**, or **11-a-side** games:
     - Prioritizes fairness by selecting players with the fewest games played in the current session.
     - Balances team skill (`Beginner`, `Intermediate`, `Advanced`) and tactical positions (`GK`, `DEF`, `MID`, `FWD`, `ANY`).
     - Allows manual locking/pinning and instant swaps between Team A, Team B, and Bench before or during a game.
   - Record live scores, player goals, assists, and Game MVPs.
   - Finalize & save the session to commit results to DynamoDB all-time player records.
