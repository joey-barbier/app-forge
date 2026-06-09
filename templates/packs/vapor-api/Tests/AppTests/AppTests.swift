import Testing
import VaporTesting
@testable import App

@Suite("{{PROJECT_NAME}} API — boot + contracts")
struct AppTests {
    /// Boots the FULL app in `.testing` (in-memory SQLite + real migrations + real
    /// middleware stack), runs the body, always shuts down. Each test gets a fresh app
    /// and a fresh database — tests stay order-independent and parallel-safe.
    private func withApp(_ body: (Application) async throws -> Void) async throws {
        let app = try await Application.make(.testing)
        do {
            try await configure(app)
            try await body(app)
        } catch {
            try? await app.asyncShutdown()
            throw error
        }
        try await app.asyncShutdown()
    }

    @Test("GET /health responds 200")
    func healthCheck() async throws {
        try await withApp { app in
            try await app.testing().test(.GET, "health") { res async in
                #expect(res.status == .ok)
                #expect(res.body.string.contains("ok"))
            }
        }
    }

    @Test("POST /api/items persists, trims the name (L3 rule), returns the DTO")
    func createItem() async throws {
        try await withApp { app in
            try await app.testing().test(.POST, "api/items", beforeRequest: { req in
                try req.content.encode(App.Item.DTO.Input(name: "  First item  "))
            }, afterResponse: { res async throws in
                #expect(res.status == .ok)
                let output = try res.content.decode(App.Item.DTO.Output.self)
                #expect(output.name == "First item") // trimming lives in the Service, not the controller
            })

            try await app.testing().test(.GET, "api/items") { res async throws in
                #expect(res.status == .ok)
                let items = try res.content.decode([App.Item.DTO.Output].self)
                #expect(items.count == 1)
            }
        }
    }

    @Test("Blank name → typed error contract {code, name, description}")
    func typedErrorContract() async throws {
        try await withApp { app in
            try await app.testing().test(.POST, "api/items", beforeRequest: { req in
                try req.content.encode(App.Item.DTO.Input(name: "   "))
            }, afterResponse: { res async throws in
                #expect(res.status == .badRequest)
                let error = try res.content.decode(
                    App.Failed.Middlewares.Handler.ErrorDescription.self
                )
                #expect(error.code == 400)
                #expect(error.name == "dataNotValid") // case name = stable public identifier
            })
        }
    }

    @Test("Duplicate name → 409 dataAlreadyExist")
    func duplicateItem() async throws {
        try await withApp { app in
            for expected in [HTTPStatus.ok, .conflict] {
                try await app.testing().test(.POST, "api/items", beforeRequest: { req in
                    try req.content.encode(App.Item.DTO.Input(name: "Twice"))
                }, afterResponse: { res async in
                    #expect(res.status == expected)
                })
            }
        }
    }

    @Test("/metrics is bearer-token gated (constant-time compare)")
    func metricsTokenGate() async throws {
        try await withApp { app in
            try await app.testing().test(.GET, "metrics") { res async in
                #expect(res.status == .unauthorized)
            }

            var wrong = HTTPHeaders()
            wrong.bearerAuthorization = .init(token: "not-the-token")
            try await app.testing().test(.GET, "metrics", headers: wrong) { res async in
                #expect(res.status == .unauthorized)
            }

            var headers = HTTPHeaders()
            headers.bearerAuthorization = .init(token: "test-metrics-token")
            try await app.testing().test(.GET, "metrics", headers: headers) { res async in
                #expect(res.status == .ok)
            }
        }
    }
}
