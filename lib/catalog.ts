export const GENRES = [
  'Hip Hop','Trap','Drill','R&B','Pop','Rock','Electronic','Afro','Dancehall','Reggae','Country','World','Lo-fi','Jazz','Soul','Latin','House','Techno','Metal'
] as const;

export const STYLES = [
  'Dark Trap','Melodic Trap','Hard Trap','Detroit','UK Drill','NY Drill','Jersey Club','Boom Bap','PluggnB','Rage','Guitar','Piano','Ambient','Cinematic','Sad','Aggressive','Chill','Club','Experimental','Tech','Metal'
] as const;

export const MOODS = [
  'Dark','Energetic','Melodic','Aggressive','Emotional','Chill','Dreamy','Cinematic','Happy','Sad','Spacey','Raw','Luxury','Street','Club'
] as const;

export type Genre = (typeof GENRES)[number];
export type BeatStyle = (typeof STYLES)[number];
export type Mood = (typeof MOODS)[number];
