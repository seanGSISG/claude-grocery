import { z } from 'zod';

export const StoreChainEnum = z.enum([
  'king_soopers',
  'safeway',
  'costco',
  'sprouts',
  'walmart',
  'target',
  'whole_foods',
  'natural_grocers',
]);

export type StoreChain = z.infer<typeof StoreChainEnum>;

export const StoreSchema = z.object({
  id: z.string(),
  chain: StoreChainEnum,
  name: z.string(),
  address: z.string(),
  city: z.string(),
  state: z.string(),
  zipCode: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  krogerLocationId: z.string().nullable().default(null),
  supportsDelivery: z.boolean().default(false),
  supportsPickup: z.boolean().default(false),
});

export type Store = z.infer<typeof StoreSchema>;
