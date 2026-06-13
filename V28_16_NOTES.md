# v28.16 Build Notes

- Fixed the Scoring Input combo tee display so combo tees show the active hole's resolved source tee name instead of repeating the combo tee name.
- Updated the hole metadata line and player tee labels to use the hole-specific combo source tee where available.
- Added a safe fallback that can infer the source tee from existing combo hole data when older/local data does not have a resolvable source tee id.
