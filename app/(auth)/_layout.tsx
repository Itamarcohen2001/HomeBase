import { useTheme } from '../../src/context/ThemeContext';
import { Stack } from 'expo-router';


export default function AuthLayout() {
  const { colors } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
