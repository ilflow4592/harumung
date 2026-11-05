import { Redirect } from 'expo-router';

/** 로그인은 2주차. 지금은 오늘 폴더로 바로 간다. */
export default function Index() {
  return <Redirect href="/folders" />;
}
