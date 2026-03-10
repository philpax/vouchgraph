import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";

const _vouchViewSchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal("dev.atvouch.graph.defs#vouchView"),
  ),
  createdAt: /*#__PURE__*/ v.datetimeString(),
  creatorDid: /*#__PURE__*/ v.didString(),
  targetDid: /*#__PURE__*/ v.didString(),
  uri: /*#__PURE__*/ v.resourceUriString(),
});

type vouchView$schematype = typeof _vouchViewSchema;

export interface vouchViewSchema extends vouchView$schematype {}

export const vouchViewSchema = _vouchViewSchema as vouchViewSchema;

export interface VouchView extends v.InferInput<typeof vouchViewSchema> {}
