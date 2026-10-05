export type Collaborator = {
  name: string;
  image?: string;
  note?: string;
  link?: string;
};

// Add the rappers/artists you have actually worked with here.
// Example:
// { name: 'Artist Name', image: '/artists/artist-name.jpg', note: '2 tracks together', link: 'https://...' }
export const COLLABORATORS: Collaborator[] = [];
