import 'react-native-quick-crypto';
import React, { useEffect } from 'react';
import { NavigationContainer, type LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import ScannerScreen from './screens/ScannerScreen';
import ResultScreen from './screens/ResultScreen';
import { colors } from './theme';

export type RootStackParamList = {
  Scanner: undefined;
  Result: { txHashB64: string; keyB64: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [
    Linking.createURL('/'),
    'https://signchain.app',
    'signchain://',
  ],
  config: {
    screens: {
      Result: {
        path: 'v/:txHashB64',
      },
      Scanner: '*',
    },
  },
};

export const App = () => {
  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.white },
          headerTintColor: colors.brand[700],
          headerTitleStyle: { fontWeight: '600' },
        }}
      >
        <Stack.Screen
          name="Scanner"
          component={ScannerScreen}
          options={{ title: 'SignChain Verify', headerShown: false }}
        />
        <Stack.Screen
          name="Result"
          component={ResultScreen}
          options={{ title: 'Verification Result' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default App;
