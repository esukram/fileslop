import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_SHA256, sign } from "../src/sigv4.ts";

// "Example: GET Object" from the AWS SigV4 header-based authentication documentation.
test("sign matches the AWS S3 GET Object example", () => {
  const headers = sign(
    {
      method: "GET",
      url: new URL("https://examplebucket.s3.amazonaws.com/test.txt"),
      headers: { Range: "bytes=0-9" },
      payloadHash: EMPTY_SHA256,
      region: "us-east-1",
      date: new Date("2013-05-24T00:00:00Z"),
    },
    {
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    },
  );
  assert.equal(
    headers["authorization"],
    "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request," +
      "SignedHeaders=host;range;x-amz-content-sha256;x-amz-date," +
      "Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
  );
  assert.equal(headers["x-amz-date"], "20130524T000000Z");
  assert.equal(headers["host"], undefined);
});
