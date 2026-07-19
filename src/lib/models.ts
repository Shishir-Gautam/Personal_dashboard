import { Schema, model, models, Model } from 'mongoose'

const TreeSchema = new Schema({
  slug: { type: String, unique: true, required: true },
  title: { type: String, required: true },
  kind: { type: String, enum: ['project', 'life', 'course'], required: true },
  proposed: [{ title: String, why: String, at: { type: Date, default: Date.now } }],
}, { timestamps: true })

const NodeSchema = new Schema({
  treeId: { type: Schema.Types.ObjectId, ref: 'Tree', index: true, required: true },
  title: { type: String, required: true },
  why: { type: String, default: '' },
  status: { type: String, enum: ['locked', 'available', 'in_progress', 'done'], default: 'locked' },
  progress: { type: Number, min: 0, max: 100, default: 0 },
  nextAction: { type: String, default: '' },
  reviewDue: Date,
  position: { x: Number, y: Number },
  prereqs: [{ type: Schema.Types.ObjectId, ref: 'TreeNode' }],
}, { timestamps: true })

const UpdateSchema = new Schema({
  nodeId: { type: Schema.Types.ObjectId, ref: 'TreeNode', index: true },
  treeId: { type: Schema.Types.ObjectId, ref: 'Tree', index: true, required: true },
  sessionId: String,
  summary: { type: String, required: true },
  delta: { type: Number, default: 0 },
  source: { type: String, enum: ['session', 'manual'], default: 'session' },
}, { timestamps: true })

const IntentSchema = new Schema({
  nodeId: { type: Schema.Types.ObjectId, ref: 'TreeNode' },
  treeId: { type: Schema.Types.ObjectId, ref: 'Tree', index: true, required: true },
  directive: { type: String, required: true },
  status: { type: String, enum: ['pending', 'delivered', 'done'], default: 'pending' },
  deliveredAt: Date,
}, { timestamps: true })

const ReflectionSchema = new Schema({
  weekStart: { type: Date, unique: true, required: true },
  body: { type: String, required: true },
}, { timestamps: true })

const CredentialSchema = new Schema({
  credId: { type: String, unique: true, required: true },
  publicKey: { type: String, required: true }, // base64url-encoded
  counter: { type: Number, default: 0 },
  transports: [String],
  // Constant singleton key: this app supports exactly one passkey. The unique
  // index turns concurrent registrations into a DB-enforced race instead of a
  // TOCTOU-prone countDocuments() check.
  owner: { type: String, default: 'owner', unique: true },
}, { timestamps: true })

const m = <T = unknown>(name: string, schema: Schema, coll?: string): Model<T> =>
  (models[name] as Model<T>) || model<T>(name, schema, coll)

export const Tree = m('Tree', TreeSchema)
export const TreeNode = m('TreeNode', NodeSchema, 'nodes')
export const Update = m('Update', UpdateSchema)
export const Intent = m('Intent', IntentSchema)
export const Reflection = m('Reflection', ReflectionSchema)
export const Credential = m('Credential', CredentialSchema)
