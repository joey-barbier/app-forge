import Vapor

extension App {
    /// Typed error contract. Every error this API intentionally returns is a case of one
    /// of the enums below; the middleware serializes it as `{code, name, description}`.
    ///
    /// Rules (see docs-architecture/CONVENTIONS.md):
    /// - Feature code throws `App.Failed.*` — never raw `Abort`, never string errors.
    /// - One enum per HTTP status; the case name IS the public error identifier.
    /// - Keep `convert()` on ONE line — `scripts/generate-error-codes.sh` parses this file
    ///   to generate `docs/ERROR_CODES.md`. That doc is GENERATED, never hand-written.
    enum Failed {
        enum Middlewares {}
    }
}

extension App.Failed {

    protocol CustomError: Error {
        func convert() -> HTTPStatus
    }

    enum BadRequest: CustomError {
        case jsonNotDecodable
        case queryNotFound
        case pathNotFound
        case idNotFound
        case dataNotValid

        func convert() -> HTTPStatus { .badRequest }
    }

    enum Unauthorized: CustomError {
        case unauthorized

        func convert() -> HTTPStatus { .unauthorized }
    }

    enum Forbidden: CustomError {
        case accessDenied

        func convert() -> HTTPStatus { .forbidden }
    }

    enum NotFound: CustomError {
        case dataNotFound

        func convert() -> HTTPStatus { .notFound }
    }

    enum Conflict: CustomError {
        case dataAlreadyExist

        func convert() -> HTTPStatus { .conflict }
    }

    enum InternalServer: CustomError {
        case jsonNotEncodable
        case databaseError
        case unknown

        func convert() -> HTTPStatus { .internalServerError }
    }
}

// MARK: - Middlewares
extension App.Failed.Middlewares: MiddlewaresRegister {
    static func allCases() -> [any Middleware] {
        [
            Handler()
        ]
    }
}
