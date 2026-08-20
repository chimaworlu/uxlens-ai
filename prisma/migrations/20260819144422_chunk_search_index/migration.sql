-- PRD Section 6, Stage 3: full-text search over document chunks. Not
-- representable in schema.prisma (searchVector is `Unsupported("tsvector")`),
-- so this index and trigger are maintained by hand in this raw migration.
CREATE INDEX "chunk_search_idx" ON "DocumentChunk" USING GIN ("searchVector");

CREATE TRIGGER "chunk_search_update" BEFORE INSERT OR UPDATE ON "DocumentChunk"
  FOR EACH ROW EXECUTE FUNCTION
  tsvector_update_trigger("searchVector", 'pg_catalog.english', "content");
