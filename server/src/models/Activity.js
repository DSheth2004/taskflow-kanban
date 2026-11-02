import mongoose from 'mongoose';
import { ACTIONS, COLUMN_IDS } from '../constants.js';

const activitySchema = new mongoose.Schema(
  {
    taskId: { type: mongoose.Schema.Types.ObjectId, required: true },
    // Copied rather than referenced so entries still read correctly after the task is deleted.
    taskTitle: { type: String, required: true },
    action: { type: String, enum: ACTIONS, required: true },
    from: { type: String, enum: [...COLUMN_IDS, null], default: null },
    to: { type: String, enum: [...COLUMN_IDS, null], default: null },
    changes: { type: [String], default: undefined }, // field names, for 'updated'
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
