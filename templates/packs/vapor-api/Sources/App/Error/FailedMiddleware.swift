import Vapor
import Monitoring

extension App.Failed.Middlewares {
    /// Converts thrown `App.Failed.CustomError` values into the public error contract:
    /// HTTP status from `convert()`, JSON body `{code, name, description}`.
    ///
    /// `name` is the enum case (stable, machine-matchable by clients); `description` is
    /// the human-readable status reason. Untyped errors are logged with full context,
    /// counted, and rethrown so Vapor's ErrorMiddleware formats them — a typed API must
    /// make untyped errors LOUD, not pretty.
    struct Handler: AsyncMiddleware {
        struct ErrorDescription: Codable {
            let code: UInt
            let name: String
            let description: String
        }

        func respond(to request: Request, chainingTo next: any AsyncResponder) async throws -> Response {
            do {
                return try await next.respond(to: request)
            } catch let error as any App.Failed.CustomError {
                let status = error.convert()

                recordHTTPError(status: status.code, errorName: "\(error)")

                let payload = ErrorDescription(
                    code: status.code,
                    name: "\(error)",
                    description: status.reasonPhrase
                )

                do {
                    let body = try Response.Body(data: JSONEncoder().encode(payload))
                    var headers = HTTPHeaders()
                    headers.add(name: .contentType, value: "application/json; charset=utf-8")
                    return Response(status: status, headers: headers, body: body)
                } catch {
                    return Response(status: .internalServerError,
                                    body: .init(string: "Error encoding error response"))
                }
            } catch {
                request.logger.error("Unhandled error", metadata: [
                    "error_type": "\(type(of: error))",
                    "error_description": "\(String(reflecting: error))",
                    "path": "\(request.url.path)",
                    "method": "\(request.method.rawValue)",
                ])

                recordHTTPError(status: 500, errorName: "untyped")

                throw error
            }
        }
    }
}
