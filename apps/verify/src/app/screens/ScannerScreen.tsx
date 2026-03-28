import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { parseVerifyUrl } from '../lib/url-parser';
import { colors } from '../theme';
import type { RootStackParamList } from '../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Scanner'>;

const SCAN_SIZE = 260;
const CORNER_SIZE = 28;
const CORNER_THICKNESS = 3;
const OVERLAY_COLOR = 'rgba(0,0,0,0.68)';

export default function ScannerScreen({ navigation }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const sideWidth = (width - SCAN_SIZE) / 2;
  const topHeight = (height - SCAN_SIZE) / 2;
  const bottomHeight = height - topHeight - SCAN_SIZE;

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.permissionContainer, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.permissionIconWrap}>
          <View style={styles.permissionIconOuter}>
            <View style={styles.permissionIconInner} />
          </View>
        </View>
        <Text style={styles.permissionTitle}>Camera Access Needed</Text>
        <Text style={styles.permissionText}>
          SignChain Verify uses your camera to scan QR codes on signed documents.
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission} activeOpacity={0.8}>
          <Text style={styles.permissionButtonText}>Grant Camera Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function handleBarCodeScanned({ data }: { data: string }) {
    if (scanned) return;
    const parsed = parseVerifyUrl(data);
    if (!parsed) return;
    setScanned(true);
    navigation.navigate('Result', {
      txHashB64: parsed.txHashB64,
      keyB64: parsed.keyB64,
    });
    setTimeout(() => setScanned(false), 1500);
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={handleBarCodeScanned}
      />

      {/* Dimmed overlay: top */}
      <View style={[styles.overlay, { height: topHeight, top: 0, left: 0, right: 0 }]} />
      {/* Dimmed overlay: bottom */}
      <View style={[styles.overlay, { height: bottomHeight, bottom: 0, left: 0, right: 0 }]} />
      {/* Dimmed overlay: left */}
      <View style={[styles.overlay, { width: sideWidth, top: topHeight, height: SCAN_SIZE, left: 0 }]} />
      {/* Dimmed overlay: right */}
      <View style={[styles.overlay, { width: sideWidth, top: topHeight, height: SCAN_SIZE, right: 0 }]} />

      {/* Corner brackets */}
      <View style={[styles.corner, styles.cornerTL, { top: topHeight, left: sideWidth }]} />
      <View style={[styles.corner, styles.cornerTR, { top: topHeight, left: sideWidth + SCAN_SIZE - CORNER_SIZE }]} />
      <View style={[styles.corner, styles.cornerBL, { top: topHeight + SCAN_SIZE - CORNER_SIZE, left: sideWidth }]} />
      <View style={[styles.corner, styles.cornerBR, { top: topHeight + SCAN_SIZE - CORNER_SIZE, left: sideWidth + SCAN_SIZE - CORNER_SIZE }]} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.headerTitle}>SignChain</Text>
        <Text style={styles.headerSubtitle}>Document Verification</Text>
      </View>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 36 }]}>
        <Text style={styles.instructionText}>
          {scanned ? 'QR code detected…' : 'Align the QR code within the frame'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    position: 'absolute',
    backgroundColor: OVERLAY_COLOR,
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  },
  cornerTL: {
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderColor: colors.brand[400],
    borderTopLeftRadius: 5,
  },
  cornerTR: {
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderColor: colors.brand[400],
    borderTopRightRadius: 5,
  },
  cornerBL: {
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderColor: colors.brand[400],
    borderBottomLeftRadius: 5,
  },
  cornerBR: {
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderColor: colors.brand[400],
    borderBottomRightRadius: 5,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.white,
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 3,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  instructionText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  // Permission screen
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    backgroundColor: colors.white,
  },
  permissionIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.brand[50],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  permissionIconOuter: {
    width: 44,
    height: 36,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: colors.brand[600],
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionIconInner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.brand[600],
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.gray[900],
    marginBottom: 12,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 15,
    color: colors.gray[500],
    textAlign: 'center',
    lineHeight: 23,
    marginBottom: 40,
  },
  permissionButton: {
    backgroundColor: colors.brand[600],
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 14,
  },
  permissionButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
