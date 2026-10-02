# @masdan/storage

Uploads go straight from the client to the bucket. `storage.createUpload` reserves a `file` row and returns a presigned `PUT`; the client uploads the bytes itself; `storage.confirmUpload` then verifies the object landed and records the real size and checksum. Bytes never pass through the API server, so large files cost it nothing.

Any S3-compatible backend works (MinIO locally; AWS S3, Cloudflare R2 or Tigris in production) by changing env vars only. They are listed in [docs/self-hosting.md](../../docs/self-hosting.md#object-storage).

## Local bucket

```sh
docker compose up -d minio minio-init
```

The MinIO console is at [http://localhost:5301](http://localhost:5301) (`minioadmin` / `minioadmin` by default).

## Things that bite

- **`S3_ENDPOINT` and `S3_PUBLIC_ENDPOINT` are not the same thing.** A presigned URL bakes in the host it was signed against. Inside Compose the server reaches MinIO at `http://minio:9000`, but a URL with that host is useless to a browser, hence the separate public endpoint. Running the server outside Compose, both are `localhost`.
- **Bucket CORS is separate from the server's CORS config.** The presigned `PUT` goes to the bucket, so the _bucket_ is what must allow it. Locally that is MinIO's `MINIO_API_CORS_ALLOW_ORIGIN` (already set in `docker-compose.yml`); on S3 or R2 it is a one-time bucket CORS rule allowing `PUT` from your web origin and exposing `ETag`.
- **The web app's CSP must name the bucket.** See [`apps/web/README.md`](../../apps/web/README.md#security-headers).
