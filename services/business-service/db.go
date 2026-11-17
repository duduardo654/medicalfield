package main

import (
	"context"
	"database/sql"
	"net/url"
	"time"

	_ "github.com/lib/pq"
)

// openDB abre o pool (database/sql já é um pool thread-safe: um por processo).
func openDB(dsn string) (*sql.DB, error) {
	if u, err := url.Parse(dsn); err == nil && u.Scheme != "" {
		q := u.Query()
		if q.Get("sslmode") == "" {
			q.Set("sslmode", "disable") // PostgreSQL local/da VM sem TLS; informe sslmode na URL para mudar
			u.RawQuery = q.Encode()
			dsn = u.String()
		}
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(8)
	db.SetConnMaxLifetime(30 * time.Minute)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		return nil, err
	}
	return db, nil
}
