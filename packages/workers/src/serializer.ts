const TYPED_ARRAY_TYPES = [
  "Int8Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "Int16Array",
  "Uint16Array",
  "Int32Array",
  "Uint32Array",
  "Float32Array",
  "Float64Array",
  "BigInt64Array",
  "BigUint64Array",
] as const;

type TypedArrayType = (typeof TYPED_ARRAY_TYPES)[number];

interface SerializedTypedArray {
  __type: TypedArrayType;
  __data: number[] | string[];
}

interface SerializedDate {
  __type: "Date";
  __value: string;
}

interface SerializedMap {
  __type: "Map";
  __entries: [unknown, unknown][];
}

interface SerializedSet {
  __type: "Set";
  __values: unknown[];
}

interface SerializedRegExp {
  __type: "RegExp";
  __source: string;
  __flags: string;
}

interface SerializedError {
  __type: "Error";
  __name: string;
  __message: string;
  __stack?: string;
}

type SerializedValue =
  | SerializedTypedArray
  | SerializedDate
  | SerializedMap
  | SerializedSet
  | SerializedRegExp
  | SerializedError;

function isSerializedValue(value: unknown): value is SerializedValue {
  return typeof value === "object" && value !== null && "__type" in value;
}

function getTypedArrayConstructor(
  type: TypedArrayType,
): new (data: ArrayLike<number> | ArrayLike<bigint>) => ArrayBufferView {
  const constructors: Record<
    TypedArrayType,
    new (data: ArrayLike<number> | ArrayLike<bigint>) => ArrayBufferView
  > = {
    Int8Array,
    Uint8Array,
    Uint8ClampedArray,
    Int16Array,
    Uint16Array,
    Int32Array,
    Uint32Array,
    Float32Array,
    Float64Array,
    BigInt64Array,
    BigUint64Array,
  };
  return constructors[type];
}

function needsCustomSerialization(
  data: unknown,
  seen = new WeakSet(),
): boolean {
  if (data === null || typeof data !== "object") return false;

  if (
    data instanceof Date ||
    data instanceof Map ||
    data instanceof Set ||
    data instanceof RegExp ||
    data instanceof Error
  ) {
    return true;
  }

  if (ArrayBuffer.isView(data) && !(data instanceof DataView)) {
    return true;
  }

  if (seen.has(data)) return false;
  seen.add(data);

  if (Array.isArray(data)) {
    return data.some((item) => needsCustomSerialization(item, seen));
  }

  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      if (
        needsCustomSerialization((data as Record<string, unknown>)[key], seen)
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Serializes data for transfer to workers.
 * Handles complex types like Date, Map, Set, RegExp, Error, and TypedArrays.
 *
 * @template T - The input data type
 * @param data - The data to serialize
 * @returns Serialized data suitable for postMessage
 *
 * @example
 * ```ts
 * const data = {
 *   date: new Date(),
 *   items: new Set([1, 2, 3]),
 *   buffer: new Uint8Array([1, 2, 3]),
 * };
 * const serialized = serialize(data);
 * ```
 */
export function serialize<T>(data: T): unknown {
  if (!needsCustomSerialization(data)) return data;

  const wrapped = { __root: data };
  const serialized = JSON.parse(JSON.stringify(wrapped, replacer));
  return serialized.__root;
}

/**
 * Deserializes data received from workers.
 * Restores complex types that were serialized with `serialize()`.
 *
 * @template T - The expected output type
 * @param data - The data to deserialize
 * @returns Restored data with proper types
 *
 * @example
 * ```ts
 * const result = deserialize<{ date: Date; items: Set<number> }>(data);
 * console.log(result.date instanceof Date); // true
 * console.log(result.items instanceof Set); // true
 * ```
 */
export function deserialize<T>(data: unknown): T {
  if (!needsRevival(data)) return data as T;
  return reviveValue(data) as T;
}

function needsRevival(data: unknown, seen = new WeakSet()): boolean {
  if (data === null || typeof data !== "object") return false;

  if (seen.has(data)) return false;
  seen.add(data);

  if (isSerializedValue(data)) return true;

  if (Array.isArray(data)) {
    return data.some((item) => needsRevival(item, seen));
  }

  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      if (needsRevival((data as Record<string, unknown>)[key], seen)) {
        return true;
      }
    }
  }

  return false;
}

function reviveValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(reviveValue);
  }

  if (isSerializedValue(value)) {
    return reviver("", value);
  }

  const result: Record<string, unknown> = {};
  for (const key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      result[key] = reviveValue((value as Record<string, unknown>)[key]);
    }
  }
  return result;
}

function replacer(this: unknown, _key: string, value: unknown): unknown {
  const original = _key ? (this as Record<string, unknown>)[_key] : value;

  if (original instanceof Date) {
    return { __type: "Date", __value: original.toISOString() };
  }

  if (value instanceof Map) {
    return { __type: "Map", __entries: Array.from(value.entries()) };
  }

  if (value instanceof Set) {
    return { __type: "Set", __values: Array.from(value) };
  }

  if (value instanceof RegExp) {
    return { __type: "RegExp", __source: value.source, __flags: value.flags };
  }

  if (value instanceof Error) {
    return {
      __type: "Error",
      __name: value.name,
      __message: value.message,
      __stack: value.stack,
    };
  }

  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    const typeName = value.constructor.name as TypedArrayType;
    if (TYPED_ARRAY_TYPES.includes(typeName)) {
      const arr = value as
        | Int8Array
        | Uint8Array
        | Int16Array
        | Uint16Array
        | Int32Array
        | Uint32Array
        | Float32Array
        | Float64Array
        | BigInt64Array
        | BigUint64Array;
      const data = typeName === "BigInt64Array" || typeName === "BigUint64Array"
        ? Array.from(arr as BigInt64Array | BigUint64Array, (v) => v.toString())
        : Array.from(
          arr as
            | Int8Array
            | Uint8Array
            | Int16Array
            | Uint16Array
            | Int32Array
            | Uint32Array
            | Float32Array
            | Float64Array,
        );
      return { __type: typeName, __data: data };
    }
  }

  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (!isSerializedValue(value)) {
    return value;
  }

  switch (value.__type) {
    case "Date":
      return new Date((value as SerializedDate).__value);

    case "Map": {
      const entries = (value as SerializedMap).__entries.map(
        ([k, v]) => [reviveValue(k), reviveValue(v)] as [unknown, unknown],
      );
      return new Map(entries);
    }

    case "Set": {
      const values = (value as SerializedSet).__values.map(reviveValue);
      return new Set(values);
    }

    case "RegExp":
      return new RegExp(
        (value as SerializedRegExp).__source,
        (value as SerializedRegExp).__flags,
      );

    case "Error": {
      const err = value as SerializedError;
      const error = new Error(err.__message);
      error.name = err.__name;
      if (err.__stack) {
        error.stack = err.__stack;
      }
      return error;
    }

    default:
      if (TYPED_ARRAY_TYPES.includes(value.__type)) {
        const typed = value as SerializedTypedArray;
        if (typed.__type === "BigInt64Array") {
          return new BigInt64Array((typed.__data as string[]).map(BigInt));
        }
        if (typed.__type === "BigUint64Array") {
          return new BigUint64Array((typed.__data as string[]).map(BigInt));
        }
        const Ctor = getTypedArrayConstructor(typed.__type);
        return new Ctor(typed.__data as number[]);
      }
      return value;
  }
}

/**
 * Extracts transferable objects from data for zero-copy transfer.
 * Finds ArrayBuffers, MessagePorts, and TypedArray buffers.
 *
 * @param data - The data to scan for transferables
 * @returns Array of Transferable objects
 *
 * @example
 * ```ts
 * const buffer = new ArrayBuffer(1024);
 * const view = new Uint8Array(buffer);
 * const data = { view, other: "data" };
 *
 * const transferables = extractTransferables(data);
 * worker.postMessage(data, transferables);
 * ```
 */
export function extractTransferables(data: unknown): Transferable[] {
  const transferables: Transferable[] = [];
  extractTransferablesRecursive(data, transferables, new WeakSet());
  return transferables;
}

function extractTransferablesRecursive(
  data: unknown,
  transferables: Transferable[],
  seen: WeakSet<object>,
): void {
  if (data === null || typeof data !== "object") {
    return;
  }

  if (seen.has(data)) {
    return;
  }
  seen.add(data);

  if (data instanceof ArrayBuffer) {
    transferables.push(data);
    return;
  }

  if (data instanceof MessagePort) {
    transferables.push(data);
    return;
  }

  if (ArrayBuffer.isView(data) && data.buffer instanceof ArrayBuffer) {
    transferables.push(data.buffer);
    return;
  }

  if (Array.isArray(data)) {
    for (const item of data) {
      extractTransferablesRecursive(item, transferables, seen);
    }
    return;
  }

  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      extractTransferablesRecursive(
        (data as Record<string, unknown>)[key],
        transferables,
        seen,
      );
    }
  }
}
