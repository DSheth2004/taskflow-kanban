import mongoose from 'mongoose';
import { ACTIONS } from '../constants.js';

const activitySchema = new mongoose.Schema(
  {
    taskId: { type: mongoose.Schema.Types.ObjectId, required: true },

    taskTitle: { type: String, required: true },
    action: { type: String, enum: ACTIONS, required: true },

    from: { type: String, default: null },
    to: { type: String, default: null },
    changes: { type: [String], default: undefined },
    actor: { type: String, default: 'Anonymous', maxlength: 40 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

activitySchema.index({ createdAt: -1 });

activitySchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  },
});

export const Activity = mongoose.model('Activity', activitySchema);
