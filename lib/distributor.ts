// Delivery package builder.
// Spotify, Apple Music, etc. do NOT accept direct uploads from websites: delivery goes through a licensed
// distributor/aggregator. Two options:
//  1) MANUAL: admin copies this package into your distributor account (works with any distributor).
//  2) AUTOMATIC: when you sign a white-label/API deal (Revelator, SonoSuite, FUGA, Symphonic...), send this
//     package from `deliverToDistributor()` using the credentials they give you.
export function buildDeliveryPackage(r: any, artist: any) {
  return {
    release: {
      title: r.title, type: r.release_type, primary_artist: r.primary_artist,
      featured_artists: r.featured_artists || null, genre: r.genre, language: r.language,
      explicit: r.explicit, release_date: r.release_date, label: r.label,
      copyright_line: r.copyright_line, upc: r.upc || null, cover_url: r.cover_url,
    },
    tracks: (r.tracks || []).map((t: any, i: number) => ({
      number: i + 1, title: t.title, explicit: !!t.explicit, isrc: t.isrc || null, audio_file: t.audio_path,
    })),
    stores: r.platforms,
    artist: artist ? {
      name: artist.artist_name, country: artist.country, spotify: artist.spotify_url || null,
      apple_music: artist.apple_music_url || null, instagram: artist.instagram || null,
    } : null,
  };
}

export async function deliverToDistributor(_pkg: ReturnType<typeof buildDeliveryPackage>) {
  const url = process.env.DISTRIBUTOR_API_URL, key = process.env.DISTRIBUTOR_API_KEY;
  if (!url || !key) return { ok: false, error: 'Distributor API is not configured. Use manual delivery.' };
  // TODO: map `_pkg` to your distributor's API and POST it with `key`.
  return { ok: false, error: 'Distributor adapter not implemented yet.' };
}
