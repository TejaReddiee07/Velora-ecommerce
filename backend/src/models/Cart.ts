import { Schema, model, type Types } from 'mongoose';

export interface ICartItem {
  _id: Types.ObjectId;
  product: Types.ObjectId;
  variant: Types.ObjectId;
  quantity: number;
  addedAt: Date;
}

export interface ICart {
  user?: Types.ObjectId;
  guestId?: string;
  items: Types.DocumentArray<ICartItem & Types.Subdocument>;
  couponCode?: string | null;
  expiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const cartSchema = new Schema<ICart>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    guestId: { type: String },
    items: [
      {
        product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        variant: { type: Schema.Types.ObjectId, required: true },
        quantity: { type: Number, required: true, min: 1, max: 10 },
        addedAt: { type: Date, default: Date.now },
      },
    ],
    couponCode: { type: String, uppercase: true, default: null },
    // Guest carts expire after inactivity; user carts never set this.
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

cartSchema.index({ user: 1 }, { unique: true, partialFilterExpression: { user: { $exists: true } } });
cartSchema.index({ guestId: 1 }, { unique: true, partialFilterExpression: { guestId: { $exists: true } } });
cartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { expiresAt: { $type: 'date' } } });

export const Cart = model<ICart>('Cart', cartSchema);

export interface IWishlist {
  user: Types.ObjectId;
  products: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const wishlistSchema = new Schema<IWishlist>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    products: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
  },
  { timestamps: true },
);

export const Wishlist = model<IWishlist>('Wishlist', wishlistSchema);
