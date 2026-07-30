import Constants from 'expo-constants';

const expoConfig = Constants.expoConfig;
const extra = expoConfig?.extra as
  | {
      apiBaseUrl?: string;
      wordpressBaseUrl?: string;
    }
  | undefined;

export const config = {
  apiBaseUrl: extra?.apiBaseUrl ?? 'https://stitchsense.zu-auto.co.uk',
  wordpressBaseUrl: extra?.wordpressBaseUrl ?? 'https://catlowyarns.co.uk',
};
