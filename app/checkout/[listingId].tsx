import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  Pressable,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useStripe, usePlatformPay, PlatformPay, isPlatformPaySupported } from '@stripe/stripe-react-native';
import { Image } from 'expo-image';
import { getImageUrl } from '@/lib/imageUtils';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SvgXml } from 'react-native-svg';
import type { ComponentProps } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Header } from '@/components/Header';
import { Button } from '@/components/Button';
import { BottomSheet } from '@/components/BottomSheet';
import { QueryStateView } from '@/components/QueryStateView';
import { Spacing, BorderRadius, FontFamily, Typography, ColorTokens } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/queryKeys';
import { useCreateOrder } from '@/lib/mutations';
import { calcProtectionFee, calcOrderTotal, formatGBP } from '@/lib/paymentHelpers';
import { useFeeConfig } from '@/context/FeeConfigContext';
import { edgeFetch } from '@/lib/edgeFetch';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

type PaymentMethod = 'apple_pay' | 'google_pay' | 'card';

interface ListingSummary {
  id: string;
  title: string;
  price: number;
  images: string[] | null;
  seller_id: string;
  status: string | null;
  size: string | null;
  condition: string | null;
}

interface AddressState {
  address_line1: string;
  address_line2: string | null;
  city: string;
  postcode: string;
  country: string;
}

// Official Google Pay acceptance mark (G Pay lockup). Required by Google Pay
// brand guidelines instead of plain "Google Pay" text / a generic Google logo.
// Source: assets/images/google-pay-mark_800.svg
const GOOGLE_PAY_MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1094 742"><path fill="#FFFFFF" d="M722.7,170h-352c-110,0-200,90-200,200l0,0c0,110,90,200,200,200h352c110,0,200-90,200-200l0,0C922.7,260,832.7,170,722.7,170z"/><path fill="#3C4043" d="M722.7,186.2c24.7,0,48.7,4.9,71.3,14.5c21.9,9.3,41.5,22.6,58.5,39.5c16.9,16.9,30.2,36.6,39.5,58.5c9.6,22.6,14.5,46.6,14.5,71.3s-4.9,48.7-14.5,71.3c-9.3,21.9-22.6,41.5-39.5,58.5c-16.9,16.9-36.6,30.2-58.5,39.5c-22.6,9.6-46.6,14.5-71.3,14.5h-352c-24.7,0-48.7-4.9-71.3-14.5c-21.9-9.3-41.5-22.6-58.5-39.5c-16.9-16.9-30.2-36.6-39.5-58.5c-9.6-22.6-14.5-46.6-14.5-71.3s4.9-48.7,14.5-71.3c9.3-21.9,22.6-41.5,39.5-58.5c16.9-16.9,36.6-30.2,58.5-39.5c22.6-9.6,46.6-14.5,71.3-14.5L722.7,186.2 M722.7,170h-352c-110,0-200,90-200,200l0,0c0,110,90,200,200,200h352c110,0,200-90,200-200l0,0C922.7,260,832.7,170,722.7,170L722.7,170z"/><path fill="#3C4043" d="M529.3,384.2v60.5h-19.2V295.3H561c12.9,0,23.9,4.3,32.9,12.9c9.2,8.6,13.8,19.1,13.8,31.5c0,12.7-4.6,23.2-13.8,31.7c-8.9,8.5-19.9,12.7-32.9,12.7h-31.7V384.2z M529.3,313.7v52.1h32.1c7.6,0,14-2.6,19-7.7c5.1-5.1,7.7-11.3,7.7-18.3c0-6.9-2.6-13-7.7-18.1c-5-5.3-11.3-7.9-19-7.9h-32.1V313.7z"/><path fill="#3C4043" d="M657.9,339.1c14.2,0,25.4,3.8,33.6,11.4c8.2,7.6,12.3,18,12.3,31.2v63h-18.3v-14.2h-0.8c-7.9,11.7-18.5,17.5-31.7,17.5c-11.3,0-20.7-3.3-28.3-10s-11.4-15-11.4-25c0-10.6,4-19,12-25.2c8-6.3,18.7-9.4,32-9.4c11.4,0,20.8,2.1,28.1,6.3v-4.4c0-6.7-2.6-12.3-7.9-17c-5.3-4.7-11.5-7-18.6-7c-10.7,0-19.2,4.5-25.4,13.6l-16.9-10.6C625.9,345.8,639.7,339.1,657.9,339.1z M633.1,413.3c0,5,2.1,9.2,6.4,12.5c4.2,3.3,9.2,5,14.9,5c8.1,0,15.3-3,21.6-9s9.5-13,9.5-21.1c-6-4.7-14.3-7.1-25-7.1c-7.8,0-14.3,1.9-19.5,5.6C635.7,403.1,633.1,407.8,633.1,413.3z"/><path fill="#3C4043" d="M808.2,342.4l-64,147.2h-19.8l23.8-51.5L706,342.4h20.9l30.4,73.4h0.4l29.6-73.4H808.2z"/><path fill="#4285F4" d="M452.93,372c0-6.26-0.56-12.25-1.6-18.01h-80.48v33L417.2,387c-1.88,10.98-7.93,20.34-17.2,26.58v21.41h27.59C443.7,420.08,452.93,398.04,452.93,372z"/><path fill="#34A853" d="M400.01,413.58c-7.68,5.18-17.57,8.21-29.14,8.21c-22.35,0-41.31-15.06-48.1-35.36h-28.46v22.08c14.1,27.98,43.08,47.18,76.56,47.18c23.14,0,42.58-7.61,56.73-20.71L400.01,413.58z"/><path fill="#FABB05" d="M320.09,370.05c0-5.7,0.95-11.21,2.68-16.39v-22.08h-28.46c-5.83,11.57-9.11,24.63-9.11,38.47s3.29,26.9,9.11,38.47l28.46-22.08C321.04,381.26,320.09,375.75,320.09,370.05z"/><path fill="#E94235" d="M370.87,318.3c12.63,0,23.94,4.35,32.87,12.85l24.45-24.43c-14.85-13.83-34.21-22.32-57.32-22.32c-33.47,0-62.46,19.2-76.56,47.18l28.46,22.08C329.56,333.36,348.52,318.3,370.87,318.3z"/></svg>`;

// Official Apple Pay mark (black lockup on a white pill). Required by Apple Pay
// marketing guidelines instead of the generic Apple logo + "Apple Pay" text.
// Source: assets/images/Apple_Pay_Mark_RGB_041619.svg
const APPLE_PAY_MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 165.52107 105.9651"><path d="M150.69807,0H14.82318c-0.5659,0-1.1328,0-1.69769,0.0033c-0.47751,0.0034-0.95391,0.0087-1.43031,0.0217 c-1.039,0.0281-2.0869,0.0894-3.1129,0.2738c-1.0424,0.1876-2.0124,0.4936-2.9587,0.9754 c-0.9303,0.4731-1.782,1.0919-2.52009,1.8303c-0.73841,0.7384-1.35721,1.5887-1.83021,2.52 c-0.4819,0.9463-0.7881,1.9166-0.9744,2.9598c-0.18539,1.0263-0.2471,2.074-0.2751,3.1119 c-0.0128,0.4764-0.01829,0.9528-0.0214,1.4291c-0.0033,0.5661-0.0022,1.1318-0.0022,1.6989V91.142 c0,0.5671-0.0011,1.13181,0.0022,1.69901c0.00311,0.4763,0.0086,0.9527,0.0214,1.4291 c0.028,1.03699,0.08971,2.08469,0.2751,3.11069c0.1863,1.0436,0.4925,2.0135,0.9744,2.9599 c0.473,0.9313,1.0918,1.7827,1.83021,2.52c0.73809,0.7396,1.58979,1.3583,2.52009,1.8302 c0.9463,0.4831,1.9163,0.7892,2.9587,0.9767c1.026,0.1832,2.0739,0.2456,3.1129,0.2737c0.4764,0.0108,0.9528,0.0172,1.43031,0.0194 c0.56489,0.0044,1.13179,0.0044,1.69769,0.0044h135.87489c0.5649,0,1.13181,0,1.69659-0.0044 c0.47641-0.0022,0.95282-0.0086,1.4314-0.0194c1.0368-0.0281,2.0845-0.0905,3.11301-0.2737 c1.041-0.1875,2.0112-0.4936,2.9576-0.9767c0.9313-0.4719,1.7805-1.0906,2.52011-1.8302c0.7372-0.7373,1.35599-1.5887,1.8302-2.52 c0.48299-0.9464,0.78889-1.9163,0.97429-2.9599c0.1855-1.026,0.2457-2.0737,0.2738-3.11069 c0.013-0.4764,0.01941-0.9528,0.02161-1.4291c0.00439-0.5672,0.00439-1.1319,0.00439-1.69901V14.8242 c0-0.5671,0-1.1328-0.00439-1.6989c-0.0022-0.4763-0.00861-0.9527-0.02161-1.4291c-0.02811-1.0379-0.0883-2.0856-0.2738-3.1119 c-0.18539-1.0432-0.4913-2.0135-0.97429-2.9598c-0.47421-0.9313-1.093-1.7816-1.8302-2.52 c-0.73961-0.7384-1.58881-1.3572-2.52011-1.8303c-0.9464-0.4818-1.9166-0.7878-2.9576-0.9754 c-1.0285-0.1844-2.0762-0.2457-3.11301-0.2738c-0.47858-0.013-0.95499-0.0183-1.4314-0.0217C151.82988,0,151.26297,0,150.69807,0 L150.69807,0z"/><path fill="#FFFFFF" d="M150.69807,3.532l1.67149,0.0032c0.4528,0.0032,0.90561,0.0081,1.36092,0.0205 c0.79201,0.0214,1.71849,0.0643,2.58209,0.2191c0.7507,0.1352,1.38029,0.3408,1.9845,0.6484 c0.5965,0.3031,1.14301,0.7003,1.62019,1.1768c0.479,0.4797,0.87671,1.0271,1.18381,1.6302 c0.30589,0.5995,0.51019,1.2261,0.64459,1.9823c0.1544,0.8542,0.1971,1.7832,0.21881,2.5801 c0.01219,0.4498,0.01819,0.8996,0.0204,1.3601c0.00429,0.5569,0.0042,1.1135,0.0042,1.6715V91.142 c0,0.558,0.00009,1.1136-0.0043,1.6824c-0.00211,0.4497-0.0081,0.8995-0.0204,1.3501c-0.02161,0.7957-0.0643,1.7242-0.2206,2.5885 c-0.13251,0.7458-0.3367,1.3725-0.64429,1.975c-0.30621,0.6016-0.70331,1.1484-1.18022,1.6251 c-0.47989,0.48-1.0246,0.876-1.62819,1.1819c-0.5997,0.3061-1.22821,0.51151-1.97151,0.6453 c-0.88109,0.157-1.84639,0.2002-2.57339,0.2199c-0.4574,0.0103-0.9126,0.01649-1.37889,0.0187 c-0.55571,0.0043-1.1134,0.0042-1.6692,0.0042H14.82318c-0.0074,0-0.0146,0-0.0221,0c-0.5494,0-1.0999,0-1.6593-0.0043 c-0.4561-0.00211-0.9112-0.0082-1.3512-0.0182c-0.7436-0.0201-1.7095-0.0632-2.5834-0.2193 c-0.74969-0.1348-1.3782-0.3402-1.9858-0.6503c-0.59789-0.3032-1.1422-0.6988-1.6223-1.1797 c-0.4764-0.4756-0.8723-1.0207-1.1784-1.6232c-0.3064-0.6019-0.5114-1.2305-0.64619-1.9852 c-0.15581-0.8626-0.19861-1.7874-0.22-2.5777c-0.01221-0.4525-0.01731-0.9049-0.02021-1.3547l-0.0022-1.3279l0.0001-0.3506V14.8242 l-0.0001-0.3506l0.0021-1.3251c0.003-0.4525,0.0081-0.9049,0.02031-1.357c0.02139-0.7911,0.06419-1.7163,0.22129-2.5861 c0.1336-0.7479,0.3385-1.3765,0.6465-1.9814c0.3037-0.5979,0.7003-1.1437,1.17921-1.6225 c0.477-0.4772,1.02309-0.8739,1.62479-1.1799c0.6011-0.3061,1.2308-0.5116,1.9805-0.6465c0.8638-0.1552,1.7909-0.198,2.5849-0.2195 c0.4526-0.0123,0.9052-0.0172,1.3544-0.0203l1.6771-0.0033H150.69807"/><path d="M45.1862,35.64053c1.41724-1.77266,2.37897-4.15282,2.12532-6.58506c-2.07464,0.10316-4.60634,1.36871-6.07207,3.14276 c-1.31607,1.5192-2.4809,3.99902-2.17723,6.3293C41.39111,38.72954,43.71785,37.36345,45.1862,35.64053"/><path d="M47.28506,38.98252c-3.38211-0.20146-6.25773,1.91951-7.87286,1.91951c-1.61602,0-4.08931-1.81799-6.76438-1.76899 c-3.48177,0.05114-6.71245,2.01976-8.4793,5.15079c-3.63411,6.2636-0.95904,15.55471,2.57494,20.65606 c1.71618,2.5238,3.78447,5.30269,6.50976,5.20287c2.57494-0.10104,3.58421-1.66732,6.71416-1.66732 c3.12765,0,4.03679,1.66732,6.76252,1.61681c2.82665-0.05054,4.59381-2.52506,6.30997-5.05132 c1.96878-2.877,2.77473-5.65498,2.82542-5.80748c-0.0507-0.05051-5.45058-2.12204-5.50065-8.33358 c-0.05098-5.20101,4.23951-7.6749,4.44144-7.82832C52.3832,39.4881,48.5975,39.08404,47.28506,38.98252"/><path d="M76.73385,31.94381c7.35096,0,12.4697,5.06708,12.4697,12.44437c0,7.40363-5.22407,12.49704-12.65403,12.49704h-8.13892 v12.94318h-5.88037v-37.8846H76.73385z M68.41059,51.9493h6.74732c5.11975,0,8.0336-2.75636,8.0336-7.53479 c0-4.77792-2.91385-7.50845-8.00727-7.50845h-6.77365V51.9493z"/><path d="M90.73997,61.97864c0-4.8311,3.70182-7.79761,10.26583-8.16526l7.56061-0.44614v-2.12639 c0-3.07185-2.07423-4.90959-5.53905-4.90959c-3.28251,0-5.33041,1.57492-5.82871,4.04313h-5.35574 c0.31499-4.98859,4.56777-8.66407,11.3941-8.66407c6.69466,0,10.97377,3.54432,10.97377,9.08388v19.03421h-5.43472v-4.54194 h-0.13065c-1.60125,3.07185-5.09341,5.01441-8.71623,5.01441C94.52078,70.30088,90.73997,66.94038,90.73997,61.97864z M108.56641,59.4846v-2.17905l-6.8,0.41981c-3.38683,0.23649-5.30306,1.73291-5.30306,4.09579 c0,2.41504,1.99523,3.99046,5.04075,3.99046C105.46823,65.81161,108.56641,63.08108,108.56641,59.4846z"/><path d="M119.34167,79.9889v-4.5946c0.4193,0.10483,1.36425,0.10483,1.83723,0.10483c2.6252,0,4.04313-1.10245,4.90908-3.9378 c0-0.05267,0.49931-1.68025,0.49931-1.70658l-9.97616-27.64562h6.14268l6.98432,22.47371h0.10432l6.98433-22.47371h5.9857 l-10.34483,29.06304c-2.36186,6.69517-5.0924,8.84789-10.81577,8.84789C121.17891,80.12006,119.76098,80.06739,119.34167,79.9889 z"/></svg>`;

// Logo-only lockups (no white pill) for the CTA button surface. Stripe's native
// PlatformPayButton does not render under this app's New Architecture build, so
// the wallet CTA is a custom button drawn with the official artwork instead —
// which renders reliably (same SvgXml used by the payment-method rows) and is a
// guideline-sanctioned fallback when the native button API can't be used.
const APPLE_PAY_LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="15 22 138 66"><g><g><g><path d="M45.1862,35.64053c1.41724-1.77266,2.37897-4.15282,2.12532-6.58506c-2.07464,0.10316-4.60634,1.36871-6.07207,3.14276 c-1.31607,1.5192-2.4809,3.99902-2.17723,6.3293C41.39111,38.72954,43.71785,37.36345,45.1862,35.64053"/><path d="M47.28506,38.98252c-3.38211-0.20146-6.25773,1.91951-7.87286,1.91951c-1.61602,0-4.08931-1.81799-6.76438-1.76899 c-3.48177,0.05114-6.71245,2.01976-8.4793,5.15079c-3.63411,6.2636-0.95904,15.55471,2.57494,20.65606 c1.71618,2.5238,3.78447,5.30269,6.50976,5.20287c2.57494-0.10104,3.58421-1.66732,6.71416-1.66732 c3.12765,0,4.03679,1.66732,6.76252,1.61681c2.82665-0.05054,4.59381-2.52506,6.30997-5.05132 c1.96878-2.877,2.77473-5.65498,2.82542-5.80748c-0.0507-0.05051-5.45058-2.12204-5.50065-8.33358 c-0.05098-5.20101,4.23951-7.6749,4.44144-7.82832C52.3832,39.4881,48.5975,39.08404,47.28506,38.98252"/></g><g><path d="M76.73385,31.94381c7.35096,0,12.4697,5.06708,12.4697,12.44437c0,7.40363-5.22407,12.49704-12.65403,12.49704h-8.13892 v12.94318h-5.88037v-37.8846H76.73385z M68.41059,51.9493h6.74732c5.11975,0,8.0336-2.75636,8.0336-7.53479 c0-4.77792-2.91385-7.50845-8.00727-7.50845h-6.77365V51.9493z"/><path d="M90.73997,61.97864c0-4.8311,3.70182-7.79761,10.26583-8.16526l7.56061-0.44614v-2.12639 c0-3.07185-2.07423-4.90959-5.53905-4.90959c-3.28251,0-5.33041,1.57492-5.82871,4.04313h-5.35574 c0.31499-4.98859,4.56777-8.66407,11.3941-8.66407c6.69466,0,10.97377,3.54432,10.97377,9.08388v19.03421h-5.43472v-4.54194 h-0.13065c-1.60125,3.07185-5.09341,5.01441-8.71623,5.01441C94.52078,70.30088,90.73997,66.94038,90.73997,61.97864z M108.56641,59.4846v-2.17905l-6.8,0.41981c-3.38683,0.23649-5.30306,1.73291-5.30306,4.09579 c0,2.41504,1.99523,3.99046,5.04075,3.99046C105.46823,65.81161,108.56641,63.08108,108.56641,59.4846z"/><path d="M119.34167,79.9889v-4.5946c0.4193,0.10483,1.36425,0.10483,1.83723,0.10483c2.6252,0,4.04313-1.10245,4.90908-3.9378 c0-0.05267,0.49931-1.68025,0.49931-1.70658l-9.97616-27.64562h6.14268l6.98432,22.47371h0.10432l6.98433-22.47371h5.9857 l-10.34483,29.06304c-2.36186,6.69517-5.0924,8.84789-10.81577,8.84789C121.17891,80.12006,119.76098,80.06739,119.34167,79.9889 z"/></g></g></g></svg>`;

const GOOGLE_PAY_LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="268 282 560 218"><g><g><path fill="#3C4043" d="M529.3,384.2v60.5h-19.2V295.3H561c12.9,0,23.9,4.3,32.9,12.9 c9.2,8.6,13.8,19.1,13.8,31.5c0,12.7-4.6,23.2-13.8,31.7c-8.9,8.5-19.9,12.7-32.9,12.7h-31.7V384.2z M529.3,313.7v52.1h32.1 c7.6,0,14-2.6,19-7.7c5.1-5.1,7.7-11.3,7.7-18.3c0-6.9-2.6-13-7.7-18.1c-5-5.3-11.3-7.9-19-7.9h-32.1V313.7z"/><path fill="#3C4043" d="M657.9,339.1c14.2,0,25.4,3.8,33.6,11.4c8.2,7.6,12.3,18,12.3,31.2v63h-18.3v-14.2h-0.8 c-7.9,11.7-18.5,17.5-31.7,17.5c-11.3,0-20.7-3.3-28.3-10s-11.4-15-11.4-25c0-10.6,4-19,12-25.2c8-6.3,18.7-9.4,32-9.4 c11.4,0,20.8,2.1,28.1,6.3v-4.4c0-6.7-2.6-12.3-7.9-17c-5.3-4.7-11.5-7-18.6-7c-10.7,0-19.2,4.5-25.4,13.6l-16.9-10.6 C625.9,345.8,639.7,339.1,657.9,339.1z M633.1,413.3c0,5,2.1,9.2,6.4,12.5c4.2,3.3,9.2,5,14.9,5c8.1,0,15.3-3,21.6-9 s9.5-13,9.5-21.1c-6-4.7-14.3-7.1-25-7.1c-7.8,0-14.3,1.9-19.5,5.6C635.7,403.1,633.1,407.8,633.1,413.3z"/><path fill="#3C4043" d="M808.2,342.4l-64,147.2h-19.8l23.8-51.5L706,342.4h20.9l30.4,73.4h0.4l29.6-73.4H808.2z"/></g><g><path fill="#4285F4" d="M452.93,372c0-6.26-0.56-12.25-1.6-18.01h-80.48v33L417.2,387 c-1.88,10.98-7.93,20.34-17.2,26.58v21.41h27.59C443.7,420.08,452.93,398.04,452.93,372z"/><path fill="#34A853" d="M400.01,413.58c-7.68,5.18-17.57,8.21-29.14,8.21c-22.35,0-41.31-15.06-48.1-35.36 h-28.46v22.08c14.1,27.98,43.08,47.18,76.56,47.18c23.14,0,42.58-7.61,56.73-20.71L400.01,413.58z"/><path fill="#FABB05" d="M320.09,370.05c0-5.7,0.95-11.21,2.68-16.39v-22.08h-28.46 c-5.83,11.57-9.11,24.63-9.11,38.47s3.29,26.9,9.11,38.47l28.46-22.08C321.04,381.26,320.09,375.75,320.09,370.05z"/><path fill="#E94235" d="M370.87,318.3c12.63,0,23.94,4.35,32.87,12.85l24.45-24.43 c-14.85-13.83-34.21-22.32-57.32-22.32c-33.47,0-62.46,19.2-76.56,47.18l28.46,22.08C329.56,333.36,348.52,318.3,370.87,318.3z"/></g></g></svg>`;

const PAYMENT_OPTIONS: { key: PaymentMethod; label: string; icon: IoniconName }[] = Platform.OS === 'ios'
  ? [
      { key: 'apple_pay', label: 'Apple Pay', icon: 'logo-apple' },
      { key: 'card',      label: 'Credit / Debit card', icon: 'card-outline' },
    ]
  : [
      { key: 'google_pay', label: 'Google Pay', icon: 'logo-google' },
      { key: 'card',       label: 'Credit / Debit card', icon: 'card-outline' },
    ];

// On iOS default to Apple Pay, on Android default to Google Pay
const DEFAULT_METHOD: PaymentMethod = Platform.OS === 'ios' ? 'apple_pay' : 'google_pay';

export default function CheckoutScreen() {
  const { listingId } = useLocalSearchParams<{ listingId: string }>();
  const { user } = useAuth();
  const colors = useThemeColors();
  const { feePercent, feeFlat } = useFeeConfig();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { confirmPlatformPayPayment } = usePlatformPay();
  const createOrder = useCreateOrder();

  const [address, setAddress] = useState<AddressState | null>(null);
  const [placing, setPlacing] = useState(false);
  const [applePaySupported, setApplePaySupported] = useState(false);
  const [googlePaySupported, setGooglePaySupported] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(DEFAULT_METHOD);
  const [protectionSheetVisible, setProtectionSheetVisible] = useState(false);
  // Once the buyer has begun paying, the listing flipping to `sold` is the
  // expected result of THEIR OWN purchase (the webhook marks it sold the moment
  // payment succeeds). Without this guard, the focus-refetch below sees `sold`
  // and fires the "Unavailable" alert + router.back(), clobbering the success
  // navigation to the order screen. Set true at checkout start; never reset.
  const checkoutStartedRef = useRef(false);

  // Check platform pay support on mount
  useEffect(() => {
    if (Platform.OS === 'ios') {
      isPlatformPaySupported().then(setApplePaySupported);
    } else if (Platform.OS === 'android') {
      isPlatformPaySupported({ googlePay: { testEnv: __DEV__ } }).then(setGooglePaySupported);
    }
  }, []);

  // Listing read shares the queryKeys.listings.detail cache with listing/[id]
  // and the browse caches — arriving from the listing page is an instant cache
  // hit. Selects the same column set as listing/[id] to keep cache shape
  // consistent regardless of which screen populates the entry first.
  const listingQuery = useQuery({
    queryKey: queryKeys.listings.detail(listingId),
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from('listings')
        .select(
          'id, title, description, price, original_price, price_dropped_at, images, status, category, gender, condition, occasion, size, colour, fabric, worn_at, measurements, created_at, seller_id, save_count, view_count, collection_id, seller:users!listings_seller_id_fkey(username, avatar_url, rating_avg, rating_count, created_at, seller_tier, tax_hold)'
        )
        .eq('id', listingId!)
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw error;
      return data as ListingSummary | null;
    },
    enabled: !!listingId,
  });

  useRefreshOnFocus(listingQuery.refetch);

  const listing = listingQuery.data ?? null;

  // Address fetch is intentionally NOT migrated — it's a user-row read
  // outside the listing/orders cache namespaces. Refetched on focus so a
  // round-trip through /settings/address picks up the new address.
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      (async () => {
        const { data: userData } = await supabase
          .from('user_private')
          .select('address_line1, address_line2, city, postcode, country')
          .eq('user_id', user.id)
          .single();
        if (userData?.address_line1) {
          setAddress({
            address_line1: userData.address_line1,
            address_line2: userData.address_line2,
            city: userData.city ?? '',
            postcode: userData.postcode ?? '',
            country: userData.country ?? '',
          });
        }
      })();
    }, [user])
  );

  // Validation on listing data — runs whenever the cached entry updates,
  // including a stale `available` row flipping to `sold` while the user is
  // on this screen.
  useEffect(() => {
    if (!user || !listing) return;
    // Don't bounce the buyer once their own checkout is underway — the listing
    // going `sold` here is their successful purchase, not someone else's.
    if (checkoutStartedRef.current) return;
    if (listing.status !== 'available') {
      Alert.alert('Unavailable', 'This listing is no longer available.');
      router.back();
      return;
    }
    if (listing.seller_id === user.id) {
      Alert.alert('Error', 'You cannot buy your own listing.');
      router.back();
    }
  }, [listing, user]);

  const protectionFee = listing ? calcProtectionFee(listing.price, feePercent, feeFlat) : 0;
  const total = listing ? calcOrderTotal(listing.price, feePercent, feeFlat) : 0;

  const handlePlaceOrder = async () => {
    if (!listing || !user) return;

    if (!address?.address_line1) {
      Alert.alert(
        'No delivery address',
        'Please save a delivery address before placing an order.',
        [
          { text: 'Add address', onPress: () => router.push('/settings/address') },
          { text: 'Cancel', style: 'cancel' },
        ],
        { cancelable: true }
      );
      return;
    }

    // From here on, a listing → `sold` transition is this buyer's own purchase,
    // so suppress the "Unavailable" validation bounce (see checkoutStartedRef).
    checkoutStartedRef.current = true;
    setPlacing(true);

    // Step 1 — Create PaymentIntent via Edge Function
    const piRes = await edgeFetch('create-payment-intent', { listing_id: listing.id });

    if (!piRes.ok) {
      const err = await piRes.json().catch(() => ({}));
      setPlacing(false);
      if (err?.error === 'Listing is no longer available') {
        Alert.alert('No longer available', 'This listing was just sold. Please browse other items.');
        router.back();
      } else {
        Alert.alert('Payment error', err?.error ?? 'Could not start checkout. Please try again.');
      }
      return;
    }

    const { client_secret, payment_intent_id, seller_verified } = await piRes.json();

    // Step 2 — Pay: native wallet if supported, else card PaymentSheet
    if (applePaySupported && Platform.OS === 'ios' && selectedMethod !== 'card') {
      const { error: applePayError } = await confirmPlatformPayPayment(client_secret, {
        applePay: {
          cartItems: [
            {
              label: listing.title,
              amount: listing.price.toFixed(2),
              paymentType: PlatformPay.PaymentType.Immediate,
            },
            {
              label: 'Dukanoh Safe Checkout',
              amount: protectionFee.toFixed(2),
              paymentType: PlatformPay.PaymentType.Immediate,
            },
            {
              label: 'Dukanoh',
              amount: total.toFixed(2),
              paymentType: PlatformPay.PaymentType.Immediate,
            },
          ],
          merchantCountryCode: 'GB',
          currencyCode: 'GBP',
        },
      });

      if (applePayError) {
        setPlacing(false);
        if (applePayError.code !== 'Canceled') {
          Alert.alert('Payment failed', applePayError.message);
        }
        return;
      }
    } else if (googlePaySupported && Platform.OS === 'android' && selectedMethod !== 'card') {
      const { error: googlePayError } = await confirmPlatformPayPayment(client_secret, {
        googlePay: {
          testEnv: __DEV__,
          merchantName: 'Dukanoh',
          merchantCountryCode: 'GB',
          currencyCode: 'GBP',
        },
      });

      if (googlePayError) {
        setPlacing(false);
        if (googlePayError.code !== 'Canceled') {
          Alert.alert('Payment failed', googlePayError.message);
        }
        return;
      }
    } else {
      // Fallback: card PaymentSheet (Android / no Apple Pay)
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: client_secret,
        merchantDisplayName: 'Dukanoh',
        returnURL: 'dukanoh://checkout/complete',
        paymentMethodOrder: ['card'],
        appearance: {
          colors: {
            primary: colors.primary,
            background: colors.background,
            componentBackground: colors.surface,
            componentBorder: colors.border,
            componentDivider: colors.border,
            primaryText: colors.textPrimary,
            secondaryText: colors.textSecondary,
            componentText: colors.textPrimary,
            placeholderText: colors.textSecondary,
            icon: colors.textSecondary,
            error: colors.error,
          },
          shapes: {
            borderRadius: 12,
            borderWidth: 1,
          },
          primaryButton: {
            colors: {
              background: colors.primary,
              text: '#FFFFFF',
              border: colors.primary,
            },
            shapes: {
              borderRadius: 24,
            },
          },
          // Stripe Android requires `font.family` to be the filename of a
          // font baked into android/app/src/main/res/font (lowercase, no
          // extension). We load Inter via JS at runtime, not as an Android
          // font resource — so passing 'Inter' here crashes the PaymentSheet
          // init on Android with a "should only contain lowercase
          // alphanumeric characters" error. Set the custom family on iOS only
          // and let Android fall back to its system font for the sheet.
          ...(Platform.OS === 'ios' ? { font: { family: 'Inter' } } : {}),
        },
      });

      if (initError) {
        setPlacing(false);
        Alert.alert('Payment error', initError.message);
        return;
      }

      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        setPlacing(false);
        if (presentError.code !== 'Canceled') {
          Alert.alert('Payment failed', presentError.message);
        }
        return;
      }
    }

    // Step 4 — Payment succeeded: insert the order record + flip listing to sold
    // For unverified sellers, set a far-future sentinel so stripe-connect-status
    // can find and transfer these funds once they complete onboarding.
    const payoutPendingSentinel = seller_verified
      ? null
      : '2099-01-01T00:00:00.000Z';

    try {
      const order = await createOrder.mutateAsync({
        listingId: listing.id,
        buyerId: user.id,
        sellerId: listing.seller_id,
        itemPrice: listing.price,
        protectionFee,
        totalPaid: total,
        stripePaymentId: payment_intent_id,
        sellerVerifyDeadline: payoutPendingSentinel,
        deliveryAddressLine1: address!.address_line1,
        deliveryAddressLine2: address?.address_line2 ?? null,
        deliveryCity: address!.city,
        deliveryPostcode: address!.postcode,
        deliveryCountry: address!.country,
      });
      setPlacing(false);
      router.replace(`/order/${order.id}?fromCheckout=true`);
    } catch (err) {
      setPlacing(false);
      if ((err as { code?: string })?.code === '23505') {
        // Unique constraint on listing_id fired — check if it's our own order
        const { data: existing } = await supabase
          .from('orders')
          .select('id, buyer_id')
          .eq('listing_id', listing.id)
          .single();
        if (existing?.buyer_id === user.id) {
          router.replace(`/order/${existing.id}?fromCheckout=true`);
        } else {
          Alert.alert('Just missed it', 'Someone just bought this item. Browse to find something else.');
          router.back();
        }
      } else {
        Alert.alert('Error', 'Payment taken but order could not be saved. Please contact support.');
      }
    }
  };

  const hasAddress = !!address?.address_line1;
  // Show the native wallet button only when a supported wallet is the selected
  // method; card checkout keeps the custom "Pay" button.
  const useNativeWallet =
    (Platform.OS === 'ios' && applePaySupported && selectedMethod === 'apple_pay') ||
    (Platform.OS === 'android' && googlePaySupported && selectedMethod === 'google_pay');
  const addressLine2 = address?.address_line2 ? `, ${address.address_line2}` : '';
  const addressOneLine = hasAddress
    ? `${address?.address_line1}${addressLine2}, ${address?.city}, ${address?.postcode}`
    : null;

  return (
    <ScreenWrapper>
      <Header title="Checkout" showBack />
      <QueryStateView
        query={listingQuery}
        isEmpty={!listing}
        empty={{ heading: 'Listing not found', subtext: 'This listing is no longer available.' }}
      >
        {listing && (
          <>
          <View style={styles.inner}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Order summary ─────────────────────────────────────── */}
        <View style={[styles.section, { paddingTop: 0 }]}>
          <View style={[styles.itemCard, { backgroundColor: colors.surface }]}>
            {listing.images?.[0] ? (
              <Image
                source={{ uri: getImageUrl(listing.images[0], 'thumbnail') }}
                style={styles.itemImage}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.itemImage, { backgroundColor: colors.surfaceAlt }]} />
            )}
            <View style={styles.itemInfo}>
              <Text style={[styles.itemTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                {listing.title}
              </Text>
              {(listing.size || listing.condition) && (
                <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
                  {[listing.size, listing.condition].filter(Boolean).join(' · ')}
                </Text>
              )}
            </View>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* ── Delivery ──────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Delivery</Text>
            <TouchableOpacity onPress={() => router.push('/settings/address')} hitSlop={8}>
              <Text style={[styles.sectionAction, { color: colors.primary }]}>
                {hasAddress ? 'Change' : 'Add address'}
              </Text>
            </TouchableOpacity>
          </View>

          {hasAddress ? (
            <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
              {addressOneLine}
            </Text>
          ) : (
            <View style={styles.inlineAlert}>
              <Ionicons name="location-outline" size={15} color={colors.error} />
              <Text style={[styles.inlineAlertText, { color: colors.error }]}>
                No delivery address saved
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* ── Payment method ────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Payment</Text>
          </View>

          <View style={styles.paymentOptions}>
            {PAYMENT_OPTIONS.map(option => {
              const active = selectedMethod === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.paymentOption,
                    {
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? `${colors.primary}08` : 'transparent',
                    },
                  ]}
                  onPress={() => setSelectedMethod(option.key)}
                  activeOpacity={0.75}
                >
                  <View style={styles.paymentOptionLeft}>
                    {option.key === 'google_pay' ? (
                      // Official Google Pay mark already contains the "G Pay"
                      // lockup, so we don't add a duplicate text label next to it.
                      <SvgXml xml={GOOGLE_PAY_MARK} width={53} height={36} />
                    ) : option.key === 'apple_pay' ? (
                      // Official Apple Pay mark already contains the "Apple Pay"
                      // lockup, so we don't add a duplicate text label next to it.
                      <SvgXml xml={APPLE_PAY_MARK} width={34} height={22} />
                    ) : (
                      <>
                        <Ionicons
                          name={option.icon}
                          size={18}
                          color={active ? colors.primary : colors.textSecondary}
                        />
                        <Text
                          style={[
                            styles.paymentOptionLabel,
                            { color: active ? colors.textPrimary : colors.textSecondary },
                          ]}
                        >
                          {option.label}
                        </Text>
                      </>
                    )}
                  </View>
                  <View style={[
                    styles.radioOuter,
                    { borderColor: active ? colors.primary : colors.border },
                  ]}>
                    {active && <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {selectedMethod === 'card' && (
            <View style={[styles.cardPlaceholder, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Ionicons name="lock-closed-outline" size={14} color={colors.textSecondary} />
              <Text style={[styles.cardPlaceholderText, { color: colors.textSecondary }]}>
                Enter card details at the next step
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* ── Price breakdown + total ───────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.feeRow}>
            <Text style={[styles.feeLabel, { color: colors.textSecondary }]}>Item price</Text>
            <Text style={[styles.feeValue, { color: colors.textSecondary }]}>{formatGBP(listing.price)}</Text>
          </View>
          <TouchableOpacity
            style={styles.feeRow}
            onPress={() => setProtectionSheetVisible(true)}
            activeOpacity={0.7}
          >
            <View style={styles.feeLabelRow}>
              <Text style={[styles.feeLabel, { color: colors.textSecondary }]}>Dukanoh Safe Checkout</Text>
              <Ionicons name="shield-checkmark-outline" size={13} color={colors.success} style={{ marginLeft: 4 }} />
            </View>
            <Text style={[styles.feeValue, { color: colors.textSecondary }]}>{formatGBP(protectionFee)}</Text>
          </TouchableOpacity>
          <View style={[styles.inlineDivider, { backgroundColor: colors.border }]} />
          <View style={styles.feeRow}>
            <Text style={[styles.totalLabel, { color: colors.textPrimary }]}>Total (tax included)</Text>
            <Text style={[styles.totalValue, { color: colors.textPrimary }]}>{formatGBP(total)}</Text>
          </View>
        </View>
      </ScrollView>

      {/* ── Sticky CTA ────────────────────────────────────────── */}
      <View style={[styles.stickyBar, {
        borderTopColor: colors.border,
        backgroundColor: colors.background,
        paddingBottom: insets.bottom + Spacing.sm,
      }]}>
        {useNativeWallet ? (
          // Apple / Google guidelines require the native wallet button (not a
          // custom "Pay" button) to initiate a wallet payment. The native button
          // has no loading state, so we overlay a spinner while the order is being
          // created and dim it via `disabled`.
          <Pressable
            onPress={handlePlaceOrder}
            disabled={!hasAddress || placing}
            style={({ pressed }) => [
              styles.walletButton,
              { opacity: (hasAddress ? 1 : 0.4) * (pressed ? 0.85 : 1) },
            ]}
          >
            {placing ? (
              <ActivityIndicator color="#000000" />
            ) : (
              <SvgXml
                xml={selectedMethod === 'apple_pay' ? APPLE_PAY_LOGO : GOOGLE_PAY_LOGO}
                height={26}
                width={selectedMethod === 'apple_pay' ? 54 : 67}
              />
            )}
          </Pressable>
        ) : (
          <Button
            label={`Pay · ${formatGBP(total)}`}
            onPress={handlePlaceOrder}
            loading={placing}
            disabled={!hasAddress}
          />
        )}
        {!hasAddress && (
          <Text style={[styles.disabledNote, { color: colors.textSecondary }]}>
            Add a delivery address to continue
          </Text>
        )}
      </View>
      </View>

      {/* ── Safe Checkout sheet ──────────────────────────────── */}
      <BottomSheet
        visible={protectionSheetVisible}
        onClose={() => setProtectionSheetVisible(false)}
      >
        <Text style={styles.modalTitle}>Price breakdown</Text>

        <View style={styles.breakdownRow}>
          <View style={styles.breakdownIconWrap}>
            <Ionicons name="pricetag-outline" size={18} color={colors.textPrimary} />
          </View>
          <View style={styles.breakdownInfo}>
            <Text style={styles.breakdownLabel} numberOfLines={1}>{listing.title}</Text>
            <Text style={styles.breakdownValue}>£{listing.price.toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.breakdownDivider} />

        <View style={styles.breakdownRow}>
          <View style={styles.breakdownIconWrap}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.textPrimary} />
          </View>
          <View style={styles.breakdownInfo}>
            <Text style={styles.breakdownLabel}>Dukanoh Safe Checkout</Text>
            <Text style={styles.breakdownValue}>£{protectionFee.toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.breakdownDivider} />

        <View style={[styles.breakdownRow, { marginTop: Spacing.md }]}>
          <View style={styles.breakdownInfo}>
            <Text style={[styles.breakdownLabel, { ...FontFamily.semibold }]}>Total Including Safe Checkout</Text>
            <Text style={[styles.breakdownValue, { ...FontFamily.semibold }]}>£{total.toFixed(2)}</Text>
          </View>
        </View>

        <Text style={styles.breakdownNote}>
          Every purchase on Dukanoh includes Safe Checkout. If your piece does not arrive or does not match the listing, raise a dispute and our team will step in.
        </Text>
      </BottomSheet>
          </>
        )}
      </QueryStateView>
    </ScreenWrapper>
  );
}

function getStyles(colors: ColorTokens) {
  return StyleSheet.create({
    inner: {
      flex: 1,
    },
    scroll: {
      paddingTop: Spacing.base,
      paddingBottom: Spacing['2xl'],
    },
    section: {
      paddingVertical: Spacing.base,
      gap: Spacing.sm,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionTitle: {
      fontSize: 15,
      fontFamily: 'Inter_600SemiBold',
    },
    sectionAction: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
    },
    sectionBody: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      lineHeight: 20,
    },
    inlineAlert: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
    },
    inlineAlertText: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      marginHorizontal: -Spacing.base,
    },
    paymentOptions: {
      gap: Spacing.sm,
    },
    paymentOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderRadius: BorderRadius.medium,
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.md,
    },
    paymentOptionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    paymentOptionLabel: {
      fontSize: 14,
      fontFamily: 'Inter_500Medium',
    },
    radioOuter: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioInner: {
      width: 9,
      height: 9,
      borderRadius: 5,
    },
    cardPlaceholder: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      borderWidth: 1,
      borderRadius: BorderRadius.medium,
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.md,
      borderStyle: 'dashed',
    },
    cardPlaceholderText: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
    },
    itemCard: {
      flexDirection: 'row',
      gap: Spacing.md,
      borderRadius: BorderRadius.large,
      padding: Spacing.md,
    },
    itemImage: {
      width: 100,
      height: 125,
      borderRadius: BorderRadius.medium,
      flexShrink: 0,
    },
    itemInfo: {
      flex: 1,
      gap: 4,
      justifyContent: 'flex-start',
      paddingTop: 2,
    },
    itemTitle: {
      fontSize: 14,
      fontFamily: 'Inter_500Medium',
      lineHeight: 20,
    },
    itemMeta: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
    },
    inlineDivider: {
      height: StyleSheet.hairlineWidth,
    },
    feeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    feeLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    feeLabel: {
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
    },
    feeValue: {
      fontSize: 13,
      fontFamily: 'Inter_500Medium',
    },
    modalTitle: { ...Typography.subheading, color: colors.textPrimary, marginBottom: Spacing.base, textAlign: 'center' },
    breakdownRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.base,
      paddingVertical: Spacing.md,
    },
    breakdownIconWrap: {
      width: 40,
      height: 40,
      borderRadius: BorderRadius.medium,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    breakdownInfo: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    breakdownLabel: {
      ...Typography.body,
      color: colors.textPrimary,
      flex: 1,
    },
    breakdownValue: {
      ...Typography.body,
      color: colors.textPrimary,
    },
    breakdownDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
    breakdownNote: {
      ...Typography.caption,
      color: colors.textSecondary,
      marginTop: Spacing.xl,
      lineHeight: 18,
    },
    totalLabel: {
      fontSize: 14,
      fontFamily: 'Inter_500Medium',
    },
    totalValue: {
      fontSize: 17,
      fontFamily: 'Inter_700Bold',
    },
    stickyBar: {
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingTop: Spacing.base,
      gap: Spacing.sm,
    },
    disabledNote: {
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      textAlign: 'center',
    },
    walletButton: {
      width: '100%',
      height: 52, // matches the lg Button height for a consistent CTA
      borderRadius: BorderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
      // White wallet button (an official Apple Pay / Google Pay style) so the
      // dark logo artwork stays legible; a hairline border keeps it visible on
      // the light checkout bar too.
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: colors.border,
    },
  });
}
