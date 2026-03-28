import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../theme';
import type { RootStackParamList } from '../App';
import { pickAndDecodeQR } from '../lib/qr-from-image';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const FEATURES = [
  {
    title: 'Blockchain-anchored',
    subtitle: 'proof of signing',
  },
  {
    title: 'Signer identity',
    subtitle: 'decrypted from QR',
  },
  {
    title: 'Scan live or upload',
    subtitle: 'a photo',
  },
];

export default function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();

  async function handleChoosePhoto() {
    const result = await pickAndDecodeQR();
    if (result === 'cancelled') return;
    if (result === 'no-qr') {
      Alert.alert('No QR Code Found', "This image doesn't contain a SignChain QR code.");
      return;
    }
    if (result === 'invalid-qr') {
      Alert.alert('Invalid QR Code', 'This QR code is not from a SignChain document.');
      return;
    }
    navigation.navigate('Result', {
      txHashB64: result.txHashB64,
      keyB64: result.keyB64,
    });
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom + 32 },
      ]}
      bounces={false}
    >
      {/* Hero section */}
      <View style={styles.hero}>
        <Image
          source={require('../../../assets/images/logo-dark.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.tagline}>Trust every signature</Text>
      </View>

      {/* Feature list */}
      <View style={styles.featureList}>
        {FEATURES.map((f) => (
          <View key={f.title} style={styles.featureRow}>
            <View style={styles.checkCircle}>
              <Text style={styles.checkMark}>✓</Text>
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>{f.title}</Text>
              <Text style={styles.featureSubtitle}>{f.subtitle}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Action buttons */}
      <View style={styles.buttons}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('Scanner')}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>Scan QR Code</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleChoosePhoto}
          activeOpacity={0.85}
        >
          <Text style={styles.secondaryButtonText}>Choose from Photos</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.gray[50],
  },
  container: {
    flexGrow: 1,
  },
  // Hero
  hero: {
    backgroundColor: colors.brand[700],
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 52,
    paddingHorizontal: 24,
  },
  logo: {
    width: 200,
    height: 60,
    marginBottom: 16,
  },
  tagline: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 0.4,
    fontStyle: 'italic',
  },
  // Features
  featureList: {
    paddingHorizontal: 28,
    paddingTop: 36,
    paddingBottom: 12,
    gap: 24,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  checkCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.brand[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  checkMark: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.brand[700],
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.gray[800],
    marginBottom: 2,
  },
  featureSubtitle: {
    fontSize: 13,
    color: colors.gray[500],
  },
  // Buttons
  buttons: {
    paddingHorizontal: 24,
    paddingTop: 32,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: colors.brand[600],
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    shadowColor: colors.brand[900],
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  secondaryButton: {
    borderWidth: 2,
    borderColor: colors.brand[600],
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  secondaryButtonText: {
    color: colors.brand[600],
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
