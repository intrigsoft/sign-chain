import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import jsQR from 'jsqr';
import jpeg from 'jpeg-js';
import { parseVerifyUrl, type ParsedVerifyUrl } from './url-parser';

export type QrFromImageResult = ParsedVerifyUrl | 'no-qr' | 'cancelled' | 'invalid-qr';

export async function pickAndDecodeQR(): Promise<QrFromImageResult> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
  });

  if (result.canceled) {
    return 'cancelled';
  }

  const uri = result.assets[0].uri;

  // Resize to ≤800px on the longest side, convert to JPEG with base64
  const resized = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 800 } }],
    { format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );

  if (!resized.base64) {
    return 'no-qr';
  }

  // Decode base64 → Uint8Array of raw JPEG bytes
  const binaryStr = atob(resized.base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  // Decode JPEG → raw RGBA pixels
  const { data, width, height } = jpeg.decode(bytes, { useTArray: true });

  // Decode QR from pixels (jsQR needs Uint8ClampedArray, jpeg-js gives Uint8Array)
  const qrResult = jsQR(new Uint8ClampedArray(data.buffer), width, height);
  if (!qrResult) {
    return 'no-qr';
  }

  // Parse the QR data as a SignChain verify URL
  const parsed = parseVerifyUrl(qrResult.data);
  if (!parsed) {
    return 'invalid-qr';
  }

  return parsed;
}
