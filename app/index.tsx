import { StyleSheet, Text, View } from 'react-native';

export default function OverviewScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Stellar Dominion</Text>
      <Text style={styles.subtitle}>scaffold online</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#05070F' },
  title: { color: '#E6EDF7', fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#7C8CA6', fontSize: 14, marginTop: 8 },
});
