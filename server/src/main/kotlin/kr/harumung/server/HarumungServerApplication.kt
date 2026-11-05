package kr.harumung.server

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
class HarumungServerApplication

fun main(args: Array<String>) {
    runApplication<HarumungServerApplication>(*args)
}
