import SiteHeader from '@/components/SiteHeader';
import DJStudio from '@/components/DJStudio';

export const metadata = { title: 'DJ Studio — HER9AL' };

export default function DJPage(){
  return <main className="dj-page"><SiteHeader/><DJStudio/></main>;
}
