import useSWR from 'swr';
const fetcher = (url) => fetch(url).then((res) => res.json());

export default function CustomerCounter() {
  const { data } = useSWR('/api/get-count', fetcher, { refreshInterval: 60000 });
  return <div>已為 {data?.count || '...'} 位客戶提供估價服務</div>;
}